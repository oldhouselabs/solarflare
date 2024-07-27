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

export const verifyWalLevel = async (client: pg.Client) => {
  const res = await client.query(`SHOW wal_level;`);
  const walLevel = res.rows[0].wal_level;
  const isLogical = walLevel === "logical";
  if (!isLogical) {
    const configFile = (
      await client.query<{ config_file: string }>(`SHOW config_file;`)
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
  const res = await client.query(
    `SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = $1;`,
    [PUBLICATION_NAME]
  );
  return res.rows.length === 1;
};

const createPublication = async (client: pg.Client) => {
  const sql = `CREATE PUBLICATION ${PUBLICATION_NAME} WITH (publish = 'insert, update, delete');`;
  await client.query(sql);
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
    await client.query<{ schema_name: string; table_name: string }>(sql, [
      PUBLICATION_NAME,
    ])
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
  const res = await client.query(
    `SELECT * FROM pg_replication_slots 
       WHERE slot_name = $1 
       AND plugin = 'wal2json'
       AND slot_type = 'logical';`,
    [SLOT_NAME]
  );
  return res.rowCount === 1;
};

const createReplicationSlot = async (client: pg.Client) => {
  await client.query(
    `SELECT * FROM pg_create_logical_replication_slot($1, 'wal2json');`,
    [SLOT_NAME]
  );
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
  if (rlsColumn === false) {
    const res = await client.query(`SELECT * FROM ${tableRef}`);
    return res.rows;
  } else {
    const res = await client.query(
      `SELECT * FROM ${asString(tableRef, { renderPublic: true })} WHERE "${rlsColumn}" = $1`,
      [rlsKey]
    );
    return res.rows;
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

  const res = await client.query<{ table_schema: string; table_name: string }>(
    query
  );

  return res.rows.map((row) => ({
    name: row.table_name,
    schema: row.table_schema,
  }));
};

export const introspectTable = async (client: pg.Client, ref: TableRef) => {
  const query = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = $2
    `;

  const columnData = await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(query, [ref.name, ref.schema]);
  const primaryKey = await getPrimaryKey(client, ref);

  return {
    $meta: {
      pk: primaryKey,
    },
    $fields: columnData.rows,
  };
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
    await client.query(addQuery);
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
    await client.query(removeQuery);
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

  const res = await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(query, [table.schema, table.name]);

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
  await client.query(sql);
};
