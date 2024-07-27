import {
  LogicalReplicationService,
  Wal2Json,
  Wal2JsonPlugin,
} from "pg-logical-replication";
import { z } from "zod";
import { Server } from "socket.io";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

import {
  asString,
  subscribeMessageZ,
  TableRef,
  type BootstrapMessage,
} from "@repo/protocol-types";

import { createClient, selectAllWithRls, SLOT_NAME } from "./postgres";
import { loadManifest, validateManifestAuth } from "./manifest";
import { format } from "./zodErrors";
import { logger } from "./logger";
import { buildTableStructure } from "./table_info";
import { table } from "node:console";

const envSchema = z.object({
  DB_CONNECTION_STRING: z.string().min(1),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT should be an integer")
    .default("54321")
    .transform(Number),
  JWT_SECRET_KEY: z.string(),
});

export const start = async (): Promise<void> => {
  const parsed = await envSchema.safeParseAsync(process.env);

  if (!parsed.success) {
    logger.error(format(parsed.error), "Invalid environment variables.");
    process.exit(1);
  }

  const env = parsed.data;
  logger.debug(`parsed env variables: ${JSON.stringify(env, null, 2)}`);

  const manifest = await loadManifest();

  // Check that if any tables have RLS enabled, that the auth section is present.
  // Kill the process if not.
  validateManifestAuth(manifest);

  const client = await createClient(env.DB_CONNECTION_STRING);
  logger.debug(`connected to database`);

  const liveTables = await buildTableStructure(client, manifest);
  logger.debug(`live tables: ${JSON.stringify([...liveTables], null, 2)}`);

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
  logger.debug(`created http server`);
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: "*",
    },
  });
  logger.debug(`created socket.io server`);

  io.on("connection", (socket) => {
    logger.debug(
      `client connected: ${socket.handshake.address} (${io.engine.clientsCount} total)`
    );

    socket.on("disconnect", () => {
      logger.debug(
        `client disconnected: ${socket.handshake.address} (${io.engine.clientsCount} total)`
      );
    });

    socket.on("subscribe", async (msg) => {
      logger.debug(`received subscribe message: ${JSON.stringify(msg)}`);
      const parsed = await subscribeMessageZ.safeParseAsync(msg);

      if (!parsed.success) {
        logger.error(format(parsed.error), "invalid `subscribe` message.");
        return;
      }
      const data = parsed.data;
      logger.debug(`parsed subscribe message: ${JSON.stringify(data)}`);

      // First, verify the JWT and extract the relevant claim.
      const token = data.jwt;
      let claims: jwt.JwtPayload;
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET_KEY);
        if (typeof decoded === "string") {
          // We expect a JWT that is a JSON packet.
          // TODO: send an error message down the websocket.
          logger.error(`auth error: JWT is a raw string`);
          return;
        }
        claims = decoded;
      } catch (err: unknown) {
        // A failed JWT verification leads to simply an early return.
        // TODO: send an error message down the websocket.
        logger.error(`auth error: JWT verification failed`);
        return;
      }
      logger.debug(`JWT claims: ${JSON.stringify(claims)}`);

      // Retrieve information about the live table being subscribed to.
      const manifestTable = liveTables.get(data.ref);
      if (manifestTable === undefined) {
        // Attempts to subscribe to tables we don't know about are silently
        // dropped.
        logger.error(
          `attempted to subscribe to ${asString(data.ref)}, which is not specified in solarflare.json`
        );
        return;
      }
      logger.debug(`subscribing to table: ${JSON.stringify(manifestTable)}`);

      // Now, verify that the claims contain the expected RLS key.
      // TODO: ideally reimplement this by transforming the manifest on server
      // start to a more convenient data structure.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we have already validated the manifest
      if (manifestTable.rls !== false && !claims[manifest.auth!.claim]) {
        logger.error(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we have already validated the manifest
          `auth error: JWT claims do not contain key ${manifest.auth!.claim} as specified in solarflare.json`
        );
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we have already validated the manifest
      const rlsKey = manifestTable.rls && claims[manifest.auth!.claim];
      logger.debug(`RLS key: ${rlsKey}`);

      const socketSubName = socketRoom(data.ref, rlsKey);
      logger.debug(`socket sub name: ${socketSubName}`);

      socket.join(socketSubName);
      logger.debug(`client joined room: ${socketSubName}`);

      // Now that this socket is subscribed to data change events, we
      // send the current state.
      // TODO: there is a fiddly race condition to be careful about here.
      // Need revisiting. Clients should receive this state and then reconcile
      // any change events since this state afterwards.
      const bootstrapResults = await selectAllWithRls(
        client,
        data.ref,
        manifestTable.rls,
        rlsKey
      );

      socket.emit("bootstrap", {
        info: manifestTable,
        data: bootstrapResults,
      } satisfies BootstrapMessage);
      logger.debug(`sent bootstrap data to client`);
    });
  });

  // Start the logical replication service.
  service.subscribe(plugin, SLOT_NAME);
  logger.debug(`subscribed to logical replication slot`);

  service.on("data", (lsn: string, log: Wal2Json.Output) => {
    logger.debug(`received logical replication data: ${JSON.stringify(log)}`);

    for (const change of log.change) {
      const tableRef = {
        schema: change.schema,
        name: change.table,
      };

      const manifestTable = liveTables.get(tableRef);
      if (manifestTable === undefined) {
        // It is possible that the Postgres logical replication subscription
        // has been configured to emit changes for more than just the live tables
        // we are meant to be serving. In this case, we should silently drop the
        // change.
        logger.debug(
          `skipping change event for table ${asString(tableRef)} not in solarflare.json`
        );
        return;
      }
      const rlsColumn = manifestTable.rls;
      logger.debug(`change event for table: ${asString(tableRef)}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix
      const o: any = {};
      switch (change.kind) {
        case "insert":
        case "update": {
          change.columnnames.forEach((col, idx) => {
            o[col] = change.columnvalues[idx];
          });
          logger.debug(`change event data: ${JSON.stringify(o, null, 2)}`);

          // If the row is not specifying the information about the rlsColumn, then
          // we don't know what to do with it, and can only safely discard. This
          // only applies if RLS is enabled for this table.
          if (
            rlsColumn !== false &&
            (!Object.hasOwn(o, rlsColumn) || o[rlsColumn] === undefined)
          ) {
            logger.error(
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
          logger.debug(
            `change event data (delete): ${JSON.stringify(o, null, 2)}`
          );
          break;
        }

        case "truncate":
        case "message": {
          logger.error(
            `received change kind \`${change.kind}\`; only \`insert\`, \`update\`, \`delete\` are supported`
          );
          break;
        }

        // Exhaustiveness check.
        default: {
          const _: never = change.kind;
        }
      }

      if (rlsColumn !== false && !Object.hasOwn(o, rlsColumn)) {
        logger.error(
          `change event does not specify the required RLS column \`${rlsColumn}\``
        );
        return;
      }

      const rlsKey = rlsColumn && o[rlsColumn];
      logger.debug(`RLS key for data change event: ${rlsKey}`);
      const socketSubscription = rlsColumn
        ? `${asString(manifestTable.ref, { renderPublic: true })}.${rlsKey}`
        : asString(manifestTable.ref, { renderPublic: true });
      logger.debug(
        `socket subscription for data change event: ${socketSubscription}`
      );
      io.to(socketSubscription).emit("change", change);
      logger.debug(
        `emitted change event to ${
          io.sockets.adapter.rooms.get(socketSubscription)?.size ?? 0
        } clients`
      );
    }
  });

  httpServer.on("error", (e: unknown) => {
    if (e instanceof Error && "code" in e && e.code === "EADDRINUSE") {
      logger.error(e.message);
      process.exit(1);
    }
  });

  // Start the websocket server.
  httpServer.listen(env.PORT, () => {
    logger.info(`✅ listening on port ${env.PORT}`);
  });

  // Return a never-fulfilled promise.
  return new Promise((_res, _rej) => {});
};

const socketRoom = (tableRef: TableRef, rlsKey: string | undefined) => {
  const opts = { renderPublic: true };
  return rlsKey
    ? `${asString(tableRef, opts)}.${rlsKey}`
    : asString(tableRef, opts);
};
