import fs from "node:fs/promises";
import path from "node:path";
import pluralize from "pluralize";
import { z } from "zod";

import { createClient, introspectTable } from "./postgres";
import { loadManifest } from "./manifest";
import { format } from "./zodErrors";

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
});

export const codegen = async () => {
  const parse = await envSchema.safeParseAsync(process.env);

  if (!parse.success) {
    console.error(format(parse.error, "Invalid environment variables."));
    process.exit(1);
  }

  const env = parse.data;

  const manifest = await loadManifest();

  const client = await createClient(env.DB_CONNECTION_STRING);

  const generated = await Promise.all(
    manifest.tables.map(async (t) => {
      const table = await introspectTable(client, t.name);
      return codegenTypeForTable(t.name, table);
    })
  );

  const dbTypedef = `export type DB = {
${generated.map((g) => `  ${g.tableName}: ${g.interfaceName};`).join("\n")}
}`;

  const fileContent = `${generated.map((g) => g.typeDef).join("\n\n")}\n\n${dbTypedef}`;

  // TODO: verify that @solarflare/client is present in node_modules.
  // If it isn't, then they are likely getting something wrong and we should bail
  // with a useful error.
  await fs.writeFile(
    path.join(
      process.cwd(),
      "node_modules",
      "@solarflare",
      "client",
      "dist",
      "db.d.ts"
    ),
    fileContent
  );
};

const typeMappings: { [key: string]: string } = {
  bigint: "number",
  integer: "number",
  smallint: "number",
  decimal: "number",
  numeric: "number",
  real: "number",
  double: "number",
  serial: "number",
  bigserial: "number",
  int: "number",

  bool: "boolean",
  boolean: "boolean",

  char: "string",
  varchar: "string",
  "character varying": "string",
  text: "string",
  date: "string",
  time: "string",
  timestamp: "string",
  timestamptz: "string",
  uuid: "string",
  json: "Object",
  jsonb: "Object",
};

const codegenTypeForTable = (
  tableName: string,
  table: Awaited<ReturnType<typeof introspectTable>>
) => {
  const fields = table.rows.map((row) => {
    const tsType = typeMappings[row.data_type] || "any";
    const isOptional = row.is_nullable === "YES" ? "?" : "";
    return `  ${row.column_name}${isOptional}: ${tsType};`;
  });

  const interfaceName = capitalize(pluralize.singular(tableName));
  const typeDef = `export interface ${interfaceName} {\n${fields.join("\n")}\n}`;

  return {
    tableName,
    interfaceName,
    typeDef,
  };
};

const capitalize = (s: string) => {
  return `${s[0]?.toLocaleUpperCase()}${s.slice(1)}`;
};
