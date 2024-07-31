import { defineConfig } from "kysely-ctl";
import { createDialect } from "../src/dialect";

export default defineConfig({
  dialect: createDialect(),
  migrations: {
    migrationFolder: "migrations",
  },
  //   plugins: [],
  //   seeds: {
  //     seedFolder: "seeds",
  //   }
});
