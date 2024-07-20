import type { DB } from "../dist/db.d.ts";
import { createSolarflare } from "./solarflare";

export const { Provider, useTable } = createSolarflare<DB>();
