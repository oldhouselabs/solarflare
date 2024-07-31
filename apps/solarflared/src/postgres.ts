import pg from "pg";
import { difference } from "./utils";
import { logger } from "./logger";
import { TableRef, asString } from "@repo/protocol-types";

export const createClient = async (connectionString: string) => {
  const { Client } = pg;
  const client = new Client({
    connectionString,
  });
  client.connect();
  return client;
};

type HandleQueryErrorOpts = {
  exit?: boolean;
  msg?: string;
};

export const verifyWalLevel = async (client: pg.Client) => {
  const res = await client
    .query<{ wal_level: string }>(`SHOW wal_level;`)
    .catch(handleQueryError({ exit: true }));

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Always present
  const walLevel = res.rows[0]!.wal_level;
  const isLogical = walLevel === "logical";
  if (!isLogical) {
    const configFile = (
      await client
        .query<{ config_file: string }>(`SHOW config_file;`)
        .catch(handleQueryError({ exit: true }))
    ).rows[0]?.config_file;

    const configFileMessage =
      configFile === undefined
        ? "your postgresql.conf (find the file location with `SHOW config_file;`)"
        : configFile;

    logger.error(
      `\`wal_level\` for this database is \`${walLevel}\` but solarflared requires \`logical\`
        To switch to logical replication, edit ${configFileMessage}
        and set \`wal_level = logical\`. Then restart your Postgres server.
        `
    );
    process.exit(1);
  }
  console.log(`✅ wal_level = logical`);
};

const PUBLICATION_NAME = "solarflare_realtime";
const checkPublicationExists = async (client: pg.Client) => {
  const res = await client
    .query(`SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = $1;`, [
      PUBLICATION_NAME,
    ])
    .catch(handleQueryError({ exit: true }));
  return res.rows.length === 1;
};

const createPublication = async (client: pg.Client) => {
  const sql = `CREATE PUBLICATION ${PUBLICATION_NAME} WITH (publish = 'insert, update, delete');`;
  await client.query(sql).catch(handleQueryError({ exit: true }));
  console.log(`✅ created solarflare_realtime publication`);
};

const introspectPublishedTables = async (
  client: pg.Client
): Promise<Map<string, TableRef>> => {
  const sql = `SELECT
    n.nspname AS schema_name,
    r.relname AS table_name
FROM
    pg_publication p
JOIN
    pg_publication_rel pr ON p.oid = pr.prpubid
JOIN
    pg_class r ON pr.prrelid = r.oid
JOIN
    pg_namespace n ON r.relnamespace = n.oid
WHERE
    n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.pubname = $1
ORDER BY
    table_name;`;

  const res = (
    await client
      .query<{
        schema_name: string;
        table_name: string;
      }>(sql, [PUBLICATION_NAME])
      .catch(handleQueryError({ exit: true }))
  ).rows
    .map((t) => ({ name: t.table_name, schema: t.schema_name }))
    .map((t) => [asString(t), t] as const);

  return new Map(res);
};

export const ensurePublication = async (client: pg.Client) => {
  if (!(await checkPublicationExists(client))) {
    await createPublication(client);
  } else {
    logger.info(`✅ solarflare_realtime publication exists`);
  }

  return await introspectPublishedTables(client);
};

export const SLOT_NAME = "solarflared";
const checkReplicationSlotExists = async (client: pg.Client) => {
  const res = await client
    .query(
      `SELECT * FROM pg_replication_slots 
       WHERE slot_name = $1 
       AND plugin = 'wal2json'
       AND slot_type = 'logical';`,
      [SLOT_NAME]
    )
    .catch(handleQueryError({ exit: true }));
  return res.rowCount === 1;
};

const createReplicationSlot = async (client: pg.Client) => {
  await client
    .query(
      `SELECT * FROM pg_create_logical_replication_slot($1, 'wal2json');`,
      [SLOT_NAME]
    )
    .catch(handleQueryError({ exit: true }));
};

export const ensureReplicationSlot = async (client: pg.Client) => {
  if (!(await checkReplicationSlotExists(client))) {
    await createReplicationSlot(client);
    logger.info(`✅ created logical replication slot \`${SLOT_NAME}\``);
  } else {
    logger.info(`✅ logical replication slot \`${SLOT_NAME}\` already exists`);
  }
};

export const selectAllWithRls = async (
  client: pg.Client,
  tableRef: TableRef,
  rlsColumn: string | false,
  rlsKey: unknown
) => {
  try {
    // In the main try block, we catch and report Postgres errors, and then re-throw
    // them (exit flag is not set). We then catch them in the trailing catch block
    // to ensure this function cannot kill the Solarflare process; we return an
    // empty array in that case.

    if (rlsColumn === false) {
      const res = await client
        .query(`SELECT * FROM ${asString(tableRef, { renderPublic: true })}`)
        .catch(
          handleQueryError({
            msg: `Error selecting all rows from table ${asString(tableRef)}`,
          })
        );
      return res.rows;
    } else {
      const res = await client
        .query(
          `SELECT * FROM ${asString(tableRef, { renderPublic: true })} WHERE "${rlsColumn}" = $1`,
          [rlsKey]
        )
        .catch(
          handleQueryError({
            msg: `Error selecting all rows from table ${asString(tableRef)}`,
          })
        );
      return res.rows;
    }
  } catch (_: unknown) {
    return [];
  }
};

/**
 * Introspect the database and return information about all the tables.
 *
 * Does not include system tables.
 */
export const introspectTables = async (
  client: pg.Client
): Promise<TableRef[]> => {
  const query = `SELECT table_name, table_schema
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
    AND table_schema != 'information_schema'
    AND table_schema != 'pg_catalog';`;

  const res = await client
    .query<{ table_schema: string; table_name: string }>(query)
    .catch(handleQueryError({ exit: true }));

  return res.rows.map((row) => ({
    name: row.table_name,
    schema: row.table_schema,
  }));
};

export const introspectTable = async (client: pg.Client, ref: TableRef) => {
  const query = `
      SELECT 
          cols.column_name, 
          cols.data_type, 
          cols.is_nullable,
          CASE 
              WHEN cols.data_type = 'USER-DEFINED' THEN pg_type.typname 
              ELSE NULL 
          END AS enum_type
      FROM 
          information_schema.columns cols
      LEFT JOIN 
          pg_type ON pg_type.typname = cols.udt_name
      WHERE 
          cols.table_name = $1
          AND cols.table_schema = $2;
    `;

  const columnData = await client
    .query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
      enum_type: string | null;
    }>(query, [ref.name, ref.schema])
    .catch(handleQueryError({ exit: true }));
  const primaryKey = await getPrimaryKey(client, ref);

  return {
    $meta: {
      pk: primaryKey,
    },
    $fields: columnData.rows,
  };
};

/**
 * Introspect the database to find all the enum values for a given enum type.
 */
export const introspectEnum = async (client: pg.Client, enumName: string) => {
  const { rows } = await client.query<{
    enumlabel: string;
  }>(
    `SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = $1
      ORDER BY enumsortorder;`,
    [enumName]
  );

  return rows.map((row) => row.enumlabel);
};

/**
 * Reconcile the Postgres publication state to the desired set of tables.
 *
 * This function requires passing in the currently published tables. The function
 * assumes this list is correct, and does nothing to check it - it simply generates
 * the appropriate SQL DDL on the assumption that the `current` list is correct.
 *
 * @param client Postgres client instance.
 * @param current The currently published tables.
 * @param desired The desired set of tables to be published.
 */
export const reconcilePublicationTables = async (
  client: pg.Client,
  current: Map<string, TableRef>,
  desired: Map<string, TableRef>
) => {
  const currentTables = new Set(current.keys());
  const desiredTables = new Set(desired.keys());

  const toRemove = difference(currentTables, desiredTables);
  const toAdd = difference(desiredTables, currentTables);

  if (toAdd.size === 0 && toRemove.size === 0) {
    logger.info(
      `${PUBLICATION_NAME} publication already matches selection; nothing to update`
    );
    return;
  } else {
    logger.info(`reconciling tables publishing to ${PUBLICATION_NAME}: `);
  }

  if (toAdd.size > 0) {
    const addQuery = `ALTER PUBLICATION ${PUBLICATION_NAME} ADD TABLE ${Array.from(
      toAdd
    )
      .map((table) => `${table}`)
      .join(", ")}`;
    await client.query(addQuery).catch(handleQueryError({ exit: true }));
    toAdd.forEach((table) => {
      logger.info(` - added \`${table}\` table`);
    });
  }

  if (toRemove.size > 0) {
    const removeQuery = `ALTER PUBLICATION ${PUBLICATION_NAME} DROP TABLE ${Array.from(
      toRemove
    )
      .map((table) => `${table}`)
      .join(", ")}`;
    logger.debug(removeQuery);
    await client.query(removeQuery).catch(handleQueryError({ exit: true }));
    toRemove.forEach((table) => {
      logger.info(` - removed \`${table}\` table`);
    });
  }
};

/**
 * Retrieve details about all the columns of a given table.
 *
 * The table must be in the public schema.
 */
export const introspectColumnsForTable = async (
  client: pg.Client,
  table: TableRef
) => {
  const query = `SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision,
    numeric_scale
FROM 
    information_schema.columns
WHERE 
    table_schema = $1 AND 
    table_name = $2;`;

  const res = await client
    .query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(query, [table.schema, table.name])
    .catch(handleQueryError({ exit: true }));

  return res.rows;
};

export class CompositePrimaryKeyError extends Error {
  constructor() {
    super(`composite primary key not supported`);
  }
}

/**
 * Introspect the database to find the primary key column for a given table.
 */
export const getPrimaryKey = async (client: pg.Client, ref: TableRef) => {
  const query = `SELECT
    kcu.column_name
FROM
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE
    tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name = $1
    AND tc.table_schema = $2;`;

  const res = await client.query<{ column_name: string }>(query, [
    ref.name,
    ref.schema,
  ]);

  if (res.rows.length === 0) {
    return undefined;
  }
  if (res.rows.length > 1) {
    throw new CompositePrimaryKeyError();
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Checked above
  return res.rows[0]!.column_name;
};

export const setReplicaIdentity = async (
  client: pg.Client,
  tableRef: TableRef,
  // We don't support USING INDEX yet
  identity: "DEFAULT" | "FULL" | "NOTHING"
) => {
  const sql = `ALTER TABLE ${asString(tableRef, { renderPublic: true })} REPLICA IDENTITY ${identity}`;
  await client.query(sql).catch(handleQueryError({ exit: true }));
};

export const logPgError = (err: pg.DatabaseError) => {
  logger.error(`Postgres error: ${err.message} (code: ${err.code})`);
  logger.debug(err.stack);
};

const handleQueryError = (opts?: HandleQueryErrorOpts) => (err: Error) => {
  if (err instanceof pg.DatabaseError) {
    logPgError(err);
  } else {
    const msg = opts?.msg ?? "Error executing query";
    logger.error(`${msg}: ${err}`);
  }

  if (opts?.exit) {
    process.exit(1);
  } else {
    throw err;
  }
};
