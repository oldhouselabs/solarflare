import type { AppRouter } from "@repo/live-demo-be";
import { createTRPCReact } from "@trpc/react-query";

export const trpc: ReturnType<typeof createTRPCReact<AppRouter>> =
  createTRPCReact<AppRouter>();
