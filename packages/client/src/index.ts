import type { DB } from "./db";
import { createSolarflare } from "./solarflare";

export const { Provider, useTable } = createSolarflare<DB>();
