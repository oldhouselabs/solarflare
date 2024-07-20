import pg from "pg";
import { difference } from "./utils";

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
    console.error(
      `\`wal_level\` for this database is \`${walLevel}\` but solarflared requires \`logical\`
        To switch to logical replication, edit \`postgresql.conf\` (find the file location with \`SHOW config_file;\`)
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

const introspectPublishedTables = async (client: pg.Client) => {
  const sql = `SELECT
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

  const res = await client.query(sql, [PUBLICATION_NAME]);
  return new Set(res.rows.map((row) => row.table_name as string));
};

export const ensurePublication = async (client: pg.Client) => {
  if (!(await checkPublicationExists(client))) {
    await createPublication(client);
  } else {
    console.log(`✅ solarflare_realtime publication exists`);
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
    console.log(`✅ created logical replication slot \`${SLOT_NAME}\``);
  } else {
    console.log(`✅ logical replication slot \`${SLOT_NAME}\` already exists`);
  }
};

export const selectAllWithRls = async (
  client: pg.Client,
  table: string,
  rlsColumn: string | false,
  rlsKey: any
) => {
  if (rlsColumn === false) {
    const res = await client.query(`SELECT * FROM "${table}"`);
    return res.rows;
  } else {
    const res = await client.query(
      `SELECT * FROM "${table}" WHERE "${rlsColumn}" = $1`,
      [rlsKey]
    );
    return res.rows;
  }
};

/**
 * Introspect the public schema and return information about all the tables.
 */
export const introspectPublicSchema = async (client: pg.Client) => {
  const query = `SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';`;

  const res: { rows: { table_name: string }[] } = await client.query(query);

  return res.rows.map((row) => row.table_name);
};

export const introspectTable = async (client: pg.Client, tableName: string) => {
  if (tableName.length === 0) {
    throw new Error(`tableName cannot be empty string`);
  }

  const query = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
    `;

  return await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(query, [tableName]);
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
  current: Set<string>,
  desired: Set<string>
) => {
  const toRemove = difference(current, desired);
  const toAdd = difference(desired, current);

  if (toAdd.size === 0 && toRemove.size === 0) {
    console.log(
      `${PUBLICATION_NAME} publication already matches selection; nothing to update`
    );
    return;
  } else {
    console.log(`reconciling tables publishing to ${PUBLICATION_NAME}: `);
  }

  if (toAdd.size > 0) {
    const addQuery = `ALTER PUBLICATION ${PUBLICATION_NAME} ADD TABLE ${Array.from(
      toAdd
    )
      .map((table) => `"${table}"`)
      .join(", ")}`;
    await client.query(addQuery);
    toAdd.forEach((table) => {
      console.log(` - added \`${table}\` table`);
    });
  }

  if (toRemove.size > 0) {
    const removeQuery = `ALTER PUBLICATION ${PUBLICATION_NAME} DROP TABLE ${Array.from(
      toRemove
    )
      .map((table) => `"${table}"`)
      .join(", ")}`;
    await client.query(removeQuery);
    toRemove.forEach((table) => {
      console.log(` - removed \`${table}\` table`);
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
  table: string
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
    table_schema = 'public' AND 
    table_name = $1;`;

  const res = await client.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(query, [table]);

  return res.rows;
};
