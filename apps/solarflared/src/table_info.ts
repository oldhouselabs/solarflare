/**
 * Utilities to build a data structure that represents the DB state.
 */

import pg from "pg";

import { Tables, asString, type TableInfo } from "@repo/protocol-types";

import { logger } from "./logger";
import { Manifest } from "./manifest";
import { CompositePrimaryKeyError, getPrimaryKey } from "./postgres";

export const buildTableStructure = async (
  client: pg.Client,
  manifest: Manifest
): Promise<Tables<TableInfo>> => {
  const tableInfoMap = new Tables<TableInfo>();

  for (const table of manifest.tables) {
    let tableInfo: TableInfo;
    try {
      // Raw version can have a undefined PK.
      const tableInfoRaw = await getTableInfo(client, table);

      if (tableInfoRaw.pk === undefined) {
        logger.error(
          `table ${asString(table.ref)} does not have a primary key, which is not supported`
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
    tableInfoMap.set(table.ref, tableInfo);
  }

  return tableInfoMap;
};

const getTableInfo = async (
  client: pg.Client,
  table: Manifest["tables"][0]
) => {
  // TODO: support non-public schemas
  const pk = await getPrimaryKey(client, table.ref);
  return {
    ref: table.ref,
    rls: table.rls,
    pk,
  };
};
