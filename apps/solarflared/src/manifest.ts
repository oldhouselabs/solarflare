import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { format } from "./zodErrors";

export const manifestSchema = z.object({
  tables: z
    .object({ name: z.string(), rls: z.string().or(z.literal(false)) })
    .array(),
  auth: z.object({
    type: z.literal("jwt"),
    claim: z.string(),
  }),
});

export const loadManifest = async () => {
  // Read the solarflare.json file.
  const manifestPath = path.join(process.cwd(), "solarflare.json");

  const manifestExists = await fs
    .access(manifestPath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!manifestExists) {
    console.error(
      `no solarflare.json manifest file was found in this directory`
    );
    console.error(
      `run \`solarflare init\` to initialize your project to work with Solarflare`
    );
    process.exit(1);
  }

  const rawManifest = await fs.readFile(manifestPath, {
    encoding: "utf-8",
  });

  const parsed = await manifestSchema.safeParseAsync(JSON.parse(rawManifest));

  if (!parsed.success) {
    console.error(format(parsed.error, "Invalid solarflare.json."));
    process.exit(1);
  }

  return parsed.data;
};
