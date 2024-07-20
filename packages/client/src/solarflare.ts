// Socket.io client that connects to the backend and accepts
// generic types as produced by the `solarflare introspect`
// command, to produce a strongly typed client.

import { io, Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

export * from "./hooks";

/**
 * A change event from Postgres.
 *
 * Copied from `wal2json`.
 *
 * TODO: can be typed better as a union. `oldkeys` seems to apply to
 * deletes only, etc.
 */
interface Change {
  kind: "insert" | "update" | "delete" | "message" | "truncate";
  schema: string;
  table: string;
  columnnames: string[];
  columntypes: string[];
  columnvalues: any[];
  /**
   * +options.includePk : true
   */
  pk?: Pk;
  /**
   * +options.includeColumnPositions : true
   */
  columnpositions: number[];
  /**
   * +options.includeDefault : true
   */
  columndefaults: string[];
  /**
   * +options.includeTypeOids : true
   */
  columntypeoids: number[];
  /**
   * +options.includeNotNull : true
   */
  columnoptionals: boolean[];
  oldkeys?: {
    keynames: string[];
    keytypes: string[];
    keyvalues: any[];
  };
}

interface Pk {
  pknames: string[];
  pktypes: string[];
}

export type Table<Row> = Map<string, Row>;

type TableState =
  | { status: "ready"; table: Table<any>; notify: () => void }
  | { status: "loading"; queryId: string; notify: () => void };

export class Solarflare<DB> {
  #socket: Socket;

  /**
   * The JWT to be used when authenticating with the server.
   */
  #jwt: string;

  tables: Map<string, TableState> = new Map();

  constructor(solarflare_url: string, jwt: string) {
    this.#socket = io(solarflare_url, {
      transports: ["websocket"],
      reconnectionDelayMax: 10000,
      auth: {
        token: "123",
      },
    });
    this.#jwt = jwt;

    this.#socket.on("bootstrap", (msg) => {
      const tableName = msg.table;

      const localTable = this.tables.get(tableName);
      if (localTable === undefined) {
        throw new Error(
          "shouldn't receive bootstrap for a table we didn't request"
        );
      }

      if (localTable.status !== "loading") {
        return;
      }

      const notify = localTable.notify;

      const table = new Map();
      for (const row of msg.data) {
        table.set(row.id, row);
      }

      this.tables.set(tableName, {
        status: "ready",
        notify,
        table,
      });

      // Used to trigger re-renders in hooks that requested the data.
      notify();
    });

    this.#socket.on("change", (msg: Change) => {
      this.handleChange(msg);
    });
  }

  setJwt(jwt: string) {
    this.#jwt = jwt;
  }

  handleChange(change: Change) {
    const tableName = change.table;
    const localTable = this.tables.get(tableName);
    if (localTable === undefined) {
      console.error(`change received on untracked table \`${tableName}\``);
      return;
    }

    switch (change.kind) {
      case "insert":
      case "update": {
        const o: any = {};
        change.columnnames.forEach((col, idx) => {
          o[col] = change.columnvalues[idx];
        });

        // TODO: this fails when you don't have an ID column.
        // Need to handle PKs better.
        const id = o.id;
        if (localTable.status === "ready") {
          localTable.table.set(id, o);
        }
        break;
      }

      case "delete": {
        const o: any = {};
        change.oldkeys?.keynames.forEach((col, idx) => {
          o[col] = change.oldkeys?.keyvalues[idx];
        });
        const id = o.id;
        if (localTable.status === "ready") {
          localTable.table.delete(id);
        }
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

    localTable.notify();
  }

  subscribe(tableName: string, notify: () => void) {
    const queryId = uuid();
    this.tables.set(tableName, { status: "loading", notify, queryId });

    this.#socket.emit(
      "subscribe",
      JSON.stringify({
        queryId,
        table: tableName,
        jwt: this.#jwt,
      })
    );
  }
}
