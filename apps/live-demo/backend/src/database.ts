import { DB } from "kysely-codegen"; // this is the Database interface we defined earlier
import { Kysely } from "kysely";
import { createDialect } from "./dialect";

export const db = new Kysely<DB>({
  dialect: createDialect(),
});
