import fs from "node:fs/promises";
import path from "node:path";
import pluralize from "pluralize";
import { z } from "zod";
import pg from "pg";

import { createClient, introspectEnum, introspectTable } from "./postgres";
import { loadManifest } from "./manifest";
import { format } from "./zodErrors";
import { TableRef, asString } from "@repo/protocol-types";
import { logger } from "./logger";

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
});

export const codegen = async () => {
  const parse = await envSchema.safeParseAsync(process.env);

  if (!parse.success) {
    logger.error(format(parse.error, "Invalid environment variables."));
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
    logger.error(
      "The @solarflare/client package is not installed. Run `npm install @solarflare/client`."
    );
    process.exit(1);
  });
  const clientPackageDistPath = path.join(clientPackagePath, "dist");
  await fs.access(clientPackageDistPath).catch(() => {
    logger.error(
      "The @solarflare/client package is present in your project, but there is no 'dist' directory. You may need to build the package."
    );
    process.exit(1);
  });

  const client = await createClient(env.DB_CONNECTION_STRING);

  const generated = await Promise.all(
    manifest.tables.map(async (t) => {
      const table = await introspectTable(client, t.ref);
      return await codegenTypeForTable(client, t.ref, table);
    })
  );

  const dbTypedef = `export type DB = {
${generated.map((g) => `  ${g.tableRef.name}: ${g.interfaceName};`).join("\n")}
}`;

  const fileContent = `${generated.map((g) => g.typeDef).join("\n\n")}\n\n${dbTypedef}`;

  const codeGenPath = path.join(clientPackageDistPath, "db.d.ts");
  await fs.writeFile(codeGenPath, fileContent);

  logger.info(
    `Generated types for tables:\n ${manifest.tables.map((t) => ` - ${asString(t.ref, { renderPublic: false })}`).join(", \n")}\n\nWritten to ${codeGenPath}`
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
} as const;

const codegenTypeForTable = async (
  client: pg.Client,
  tableRef: TableRef,
  table: Awaited<ReturnType<typeof introspectTable>>
) => {
  const fieldItems = await Promise.all(
    table.$fields.map(async (row) => {
      let typeDef: string;
      if (row.data_type === "USER-DEFINED" && row.enum_type !== null) {
        const names = await introspectEnum(client, row.enum_type);
        typeDef = names.map((name) => `"${name}"`).join(" | ");
      } else {
        typeDef = typeMappings[row.data_type] || "any";
      }

      const isOptional = row.is_nullable === "YES" ? "?" : "";
      return `    ${row.column_name}${isOptional}: ${typeDef};`;
    })
  );

  // TODO: now that we support multiple schemas, the interface names can conflict.
  // We need to explicitly check for this and have a mechanism to namespace by
  // schema at the generated type level. I think the best solution is using TS
  // namespaces.
  const interfaceName = capitalize(pluralize.singular(tableRef.name));
  const meta = `  $meta: {\n    pk: "${table.$meta.pk}";\n  };`;
  const fields = `  $fields: {\n${fieldItems.join("\n")}\n  }`;
  const typeDef = `export type ${interfaceName} = {\n${meta}\n${fields}\n}`;

  return {
    tableRef,
    interfaceName,
    typeDef,
  };
};

const capitalize = (s: string) => {
  return `${s[0]?.toLocaleUpperCase()}${s.slice(1)}`;
};
