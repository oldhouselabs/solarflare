import { createSolarflare } from "@solarflare/client";
import type { DB } from "./db.d.ts";

export const { useTable } = createSolarflare<DB>();
