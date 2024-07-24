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

  // Verify that the @solarflare/client package is installed. If not, we can't
  // codegen, because there's nowhere to put the generated types.
  const clientPackagePath = path.join(
    process.cwd(),
    "node_modules",
    "@solarflare",
    "client"
  );
  await fs.access(clientPackagePath).catch(() => {
    console.error(
      "The @solarflare/client package is not installed. Run `npm install @solarflare/client`."
    );
    process.exit(1);
  });
  await fs.access(path.join(clientPackagePath, "dist")).catch(() => {
    console.error(
      "The @solarflare/client package is present in your project, but there is no 'dist' directory. You may need to build the package."
    );
    process.exit(1);
  });

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

  await fs.writeFile(
    path.join(clientPackagePath, "dist", "db.d.ts"),
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
