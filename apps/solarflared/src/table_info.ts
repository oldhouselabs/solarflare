/**
 * Utilities to build a data structure that represents the DB state.
 */

import pg from "pg";

import { type TableInfo } from "@repo/protocol-types";

import { logger } from "./logger";
import { Manifest } from "./manifest";
import { CompositePrimaryKeyError, getPrimaryKey } from "./postgres";

export const buildTableInfoMap = async (
  client: pg.Client,
  manifest: Manifest
): Promise<Map<string, TableInfo>> => {
  const tableInfoMap = new Map<string, TableInfo>();

  for (const table of manifest.tables) {
    let tableInfo: TableInfo;
    try {
      // Raw version can have a undefined PK.
      const tableInfoRaw = await getTableInfo(client, table);

      if (tableInfoRaw.pk === undefined) {
        logger.error(
          `table ${table.name} does not have a primary key, which is not supported`
        );
        process.exit(1);
      }

      tableInfo = { ...tableInfoRaw, pk: tableInfoRaw.pk };
    } catch (e) {
      if (e instanceof CompositePrimaryKeyError) {
        logger.error(
          `table ${table} has a composite primary key, which is not supported`
        );
        process.exit(1);
      } else {
        throw e;
      }
    }
    tableInfoMap.set(table.name, tableInfo);
  }

  return tableInfoMap;
};

const getTableInfo = async (
  client: pg.Client,
  table: Manifest["tables"][0]
) => {
  // TODO: support non-public schemas
  const pk = await getPrimaryKey(client, "public", table.name);
  return {
    schema: "public",
    name: table.name,
    rls: table.rls,
    pk,
  };
};
