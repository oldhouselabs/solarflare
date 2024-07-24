import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { format } from "./zodErrors";
import { logger } from "./logger";

export const manifestSchema = z.object({
  tables: z
    .object({ name: z.string(), rls: z.string().or(z.literal(false)) })
    .array(),
  auth: z
    .object({
      type: z.literal("jwt"),
      claim: z.string(),
    })
    .optional(),
});

type Manifest = z.infer<typeof manifestSchema>;

export const loadManifest = async (): Promise<Manifest> => {
  // Read the solarflare.json file.
  const manifestPath = path.join(process.cwd(), "solarflare.json");
  logger.debug(`loading manifest from ${manifestPath}`);

  const manifestExists = await fs
    .access(manifestPath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!manifestExists) {
    logger.error(
      `no solarflare.json manifest file was found in this directory`
    );
    logger.error(
      `run \`solarflare init\` to initialize your project to work with Solarflare`
    );
    process.exit(1);
  }

  const rawManifest = await fs.readFile(manifestPath, {
    encoding: "utf-8",
  });
  logger.debug(`loaded manifest: ${rawManifest}`);

  const parsed = await manifestSchema.safeParseAsync(JSON.parse(rawManifest));

  if (!parsed.success) {
    logger.error(format(parsed.error, "Invalid solarflare.json."));
    process.exit(1);
  }

  logger.debug(`parsed manifest: ${JSON.stringify(parsed.data, null, 2)}`);
  return parsed.data;
};

export const validateManifestAuth = async (manifest: Manifest) => {
  // Verify that if any tables have RLS enabled, that the auth section is present.
  const tablesWithRls = manifest.tables.filter((t) => t.rls !== false);
  if (tablesWithRls.length > 0 && !manifest.auth) {
    logger.error(
      `RLS is enabled for tables ${tablesWithRls.join(", ")}, but no auth section is present in the manifest. Unable to launch server`
    );
    process.exit(1);
  }
  logger.debug(`manifest auth settings are valid`);
};
