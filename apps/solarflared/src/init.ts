import { z } from "zod";
import {
  reconcilePublicationTables,
  createClient,
  ensurePublication,
  ensureReplicationSlot,
  introspectTables,
  verifyWalLevel,
  introspectColumnsForTable,
} from "./postgres";
import { checkbox, input, select } from "@inquirer/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import { manifestSchema } from "./manifest";
import { format } from "./zodErrors";
import { asString } from "@repo/protocol-types";

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
});

export const init = async () => {
  const manifestFilePath = path.join(process.cwd(), "solarflare.json");

  const manifestExists = await fs
    .access(manifestFilePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (manifestExists) {
    console.error(
      `a \`solarflare.json\` file already exists in this directory`
    );
    process.exit(1);
  }

  const parsed = await envSchema.safeParseAsync(process.env);

  if (!parsed.success) {
    console.error(format(parsed.error, "Invalid environment variables."));
    process.exit(1);
  }
  const env = parsed.data;

  const client = await createClient(env.DB_CONNECTION_STRING);

  // Logical replication requires `wal_level = logical` in Postgres config.
  // If this is not the case, we give the user a warning to inform them as
  // a DB restart is required.
  await verifyWalLevel(client);

  // Ensure the `solarflare_realtime` publication exists, and return a list of
  // public schema tables which are currently published, if any.
  const publishedTables = await ensurePublication(client);
  const publishedTableSet = new Set(publishedTables.keys());

  // Ensure a replication slot exists for this client.
  await ensureReplicationSlot(client);

  console.log("\n");

  // Introspect the available non-system tables
  const tables = await introspectTables(client);
  console.log(tables);

  const tableChoices = await checkbox({
    message:
      "Select which tables you would like to expose to frontend clients:",
    choices: tables
      .slice()
      .sort((t1, t2) => {
        // Sort "public" schema tables first.
        if (t1.schema === "public" && t2.schema !== "public") {
          return -1;
        }
        if (t1.schema !== "public" && t2.schema === "public") {
          return 1;
        }
        return t1.name.localeCompare(t2.name);
      })
      .map((table) => ({
        name: asString(table, { renderPublic: false }),
        value: table,
        checked: publishedTableSet.has(asString(table)),
      })),
  });

  // Choose the RLS column for each selected table.
  const rlsColumnSelections = new Map<string, string | false>();
  let didChooseRlsForAnyTable = false;
  for (const table of tableChoices) {
    const columns = await introspectColumnsForTable(client, table);

    const selection = await select<string | false>({
      message: `Select a column from table \`${table}\` to use as the row-level security key`,
      choices: [
        ...columns.map((col) => ({
          name: col.column_name,
          value: col.column_name,
        })),
        {
          name: "No row-level security (the entire table will be visible to all clients)",
          value: false,
        },
      ],
    });
    rlsColumnSelections.set(asString(table), selection);
    console.log(selection);
    if (selection !== false) {
      didChooseRlsForAnyTable = true;
    }
  }

  console.log("\n");

  // Define the JWT claim that corresponds to the RLS column.
  let claim: string | null = null;
  if (didChooseRlsForAnyTable) {
    claim = await input({
      message: "Which JWT claim corresponds to your RLS keys?",
      default: "sub",
    });
  }

  // Update replication status to reflect the selections.
  await reconcilePublicationTables(
    client,
    publishedTables,
    new Map(tableChoices.map((t) => [asString(t), t]))
  );

  const manifest = {
    tables: tableChoices.map((c) => ({
      ref: c,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we know this key exists
      rls: rlsColumnSelections.get(asString(c))!,
    })),
    auth:
      claim !== null
        ? {
            type: "jwt",
            claim,
          }
        : undefined,
  } satisfies z.infer<typeof manifestSchema>;

  // Write the manifest file to solarflare.json
  await fs.writeFile(manifestFilePath, JSON.stringify(manifest, null, 2));

  console.log(
    `Successfully initialized Solarflare.\n\nsolarflare.json has been created in this directory.`
  );
};
