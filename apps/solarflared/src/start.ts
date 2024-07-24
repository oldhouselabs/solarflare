import {
  LogicalReplicationService,
  Wal2Json,
  Wal2JsonPlugin,
} from "pg-logical-replication";
import { z } from "zod";
import { Server } from "socket.io";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

import { createClient, selectAllWithRls, SLOT_NAME } from "./postgres";
import { loadManifest, validateManifestAuth } from "./manifest";
import { format } from "./zodErrors";

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT should be an integer")
    .default("3000")
    .transform(Number),
  JWT_SECRET_KEY: z.string(),
});

/**
 * A message requesting an ongoing subscription to a table.
 */
const dataSubscription = z.object({
  queryId: z.string(),
  table: z.string().min(1),
  jwt: z.string(),
});

export const start = async (): Promise<void> => {
  const parsed = await envSchema.safeParseAsync(process.env);

  if (!parsed.success) {
    console.error(format(parsed.error), "Invalid environment variables.");
    process.exit(1);
  }
  const env = parsed.data;

  const manifest = await loadManifest();

  // Check that if any tables have RLS enabled, that the auth section is present.
  // Kill the process if not.
  validateManifestAuth(manifest);

  const liveTables = new Map(manifest.tables.map((t) => [t.name, t]));

  const client = await createClient(env.DB_CONNECTION_STRING);

  const service = new LogicalReplicationService(
    {
      connectionString: env.DB_CONNECTION_STRING,
    },
    {
      acknowledge: {
        auto: true,
        timeoutSeconds: 10,
      },
    }
  );

  const plugin = new Wal2JsonPlugin();

  // Start the websocket server.
  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {});

    socket.on("subscribe", async (msg) => {
      const parsed = await dataSubscription.safeParseAsync(JSON.parse(msg));

      if (!parsed.success) {
        // TODO: introduce a logger so we can log this in debug mode, but
        // silently drop in prod.
        console.error(format(parsed.error), "Invalid `subscribe` message.");
        return;
      }
      const data = parsed.data;

      // First, verify the JWT and extract the relevant claim.
      const token = data.jwt;
      let claims: jwt.JwtPayload;
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET_KEY);
        if (typeof decoded === "string") {
          // We expect a JWT that is a JSON packet.
          console.error(`auth error: JWT is a raw string`);
          return;
        }
        claims = decoded;
      } catch (err: unknown) {
        // A failed JWT verification leads to simply an early return.
        // TODO: send an error message down the websocket.
        console.error(`auth error: JWT verification failed`);
        return;
      }

      // Retrieve information about the live table being subscribed to.
      const manifestTable = liveTables.get(data.table);
      if (manifestTable === undefined) {
        // Attempts to subscribe to tables we don't know about are silently
        // dropped.
        console.log(
          `attempted to subscribe to ${data.table}, which is not specified in solarflare.json`
        );
        return;
      }

      // Now, verify that the claims contain the expected RLS key.
      // Note: the `!` is safe here because we have already validated the
      // manifest. TODO: ideally reimplement this by transforming the manifest
      // on server start to a more convenient data structure.
      if (manifestTable.rls !== false && !claims[manifest.auth!.claim]) {
        console.error(
          `auth error: JWT claims do not contain key ${manifest.auth!.claim} as specified in solarflare.json`
        );
        return;
      }

      const rlsKey = manifestTable.rls && claims[manifest.auth!.claim];
      const socketSubscription =
        manifestTable.rls !== false ? `${data.table}.${rlsKey}` : data.table;
      socket.join(socketSubscription);

      // Now that this socket is subscribed to data change events, we
      // send the current state.
      // TODO: there is a fiddly race condition to be careful about here.
      // Need revisiting. Clients should receive this state and then reconcile
      // any change events since this state afterwards.
      const bootstrapResults = await selectAllWithRls(
        client,
        data.table,
        manifestTable.rls,
        rlsKey
      );

      socket.emit("bootstrap", { table: data.table, data: bootstrapResults });
    });
  });

  // Start the logical replication service.
  service.subscribe(plugin, SLOT_NAME);

  service.on("data", (lsn: string, log: Wal2Json.Output) => {
    for (const change of log.change) {
      if (change.schema !== "public") continue;
      const tableName = change.table;
      const manifestTable = liveTables.get(tableName);
      if (manifestTable === undefined) {
        // It is possible that the Postgres logical replication subscription
        // has been configured to emit changes for more than just the live tables
        // we are meant to be serving. In this case, we should silently drop the
        // change.
        return;
      }
      const rlsColumn = manifestTable.rls;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix
      const o: any = {};
      switch (change.kind) {
        case "insert":
        case "update": {
          change.columnnames.forEach((col, idx) => {
            o[col] = change.columnvalues[idx];
          });

          // If the row is not specifying the information about the rlsColumn, then
          // we don't know what to do with it, and can only safely discard. This
          // only applies if RLS is enabled for this table.
          if (
            rlsColumn !== false &&
            (!Object.hasOwn(o, rlsColumn) || o[rlsColumn] === undefined)
          ) {
            console.error(
              `change event does not specify the required RLS column \`${rlsColumn}\``
            );

            // Early return.
            return;
          }

          break;
        }

        case "delete": {
          change.oldkeys?.keynames.forEach((col, idx) => {
            o[col] = change.oldkeys?.keyvalues[idx];
          });
          break;
        }

        case "truncate":
        case "message": {
          console.error(
            `received change kind \`${change.kind}\`; only \`insert\`, \`update\`, \`delete\` are supported`
          );
          break;
        }

        // Exhaustiveness check.
        default: {
          const _: never = change.kind;
        }
      }

      const rlsKey = rlsColumn && o[rlsColumn];
      const socketSubscription = rlsColumn
        ? `${manifestTable.name}.${rlsKey}`
        : manifestTable.name;
      io.to(socketSubscription).emit("change", change);
    }
  });

  httpServer.on("error", (e: unknown) => {
    if (e instanceof Error && "code" in e && e.code === "EADDRINUSE") {
      console.error(e.message);
      process.exit(1);
    }
  });

  // Start the websocket server.
  httpServer.listen(env.PORT, () => {
    console.log(`✅ listening on port ${env.PORT}`);
  });

  // Return a never-fulfilled promise.
  return new Promise((_res, _rej) => {});
};
