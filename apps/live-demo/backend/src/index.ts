import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { deleteTodo, insertTodo, updateTodo } from "./TodoRepository";
import { LexoRank } from "lexorank";
import { router, publicProcedure } from "./trpc";
import cors from "cors";
import { z } from "zod";
import { config } from "dotenv";

// Load environment variables
config();

// Parse environment variables.
const envSchema = z.object({
  LIVE_DEMO_FRONTEND_URL: z.string().url(),
  LIVE_DEMO_BACKEND_URL: z.string().url(),
});

const env = envSchema.parse(process.env);

const statusSchema = z.union([
  z.literal("todo"),
  z.literal("in-progress"),
  z.literal("done"),
]);

const idSchema = z.object({ id: z.number() });
const todoSchema = z.object({
  status: statusSchema,
  text: z.string(),
  rank: z.string().refine((rank) => {
    try {
      return LexoRank.parse(rank) !== null;
    } catch (e: unknown) {
      return false;
    }
  }),
});

const appRouter = router({
  insertItem: publicProcedure.input(todoSchema).mutation(async (opts) => {
    const insertedTodo = opts.input;
    await insertTodo(insertedTodo);
    return true;
  }),
  updateItem: publicProcedure
    .input(z.intersection(todoSchema.partial(), idSchema))
    .mutation(async (opts) => {
      const updatedItem = opts.input;
      await updateTodo(updatedItem);
      return true;
    }),
  deleteItem: publicProcedure.input(idSchema).mutation(async (opts) => {
    await deleteTodo(opts.input.id);
    return true;
  }),
});

const server = createHTTPServer({
  middleware: cors({
    origin: env.LIVE_DEMO_FRONTEND_URL,
  }),
  router: appRouter,
});

const parsedUrl = new URL(env.LIVE_DEMO_BACKEND_URL);
const port = parseInt(parsedUrl.port);

server.listen(port);
server.server.on("listening", () => {
  console.log(`Listening on ${env.LIVE_DEMO_BACKEND_URL}`);
});

export type AppRouter = typeof appRouter;
