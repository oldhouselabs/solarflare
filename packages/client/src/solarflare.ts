// Socket.io client that connects to the backend and accepts
// generic types as produced by the `solarflare introspect`
// command, to produce a strongly typed client.

import { io, Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

import {
  DBRow,
  InferPkType,
  TableInfo,
  type BootstrapMessage,
} from "@repo/protocol-types";

export * from "./hooks";
import { OptimisticChangeForTable } from "./optimistic";

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
  columnvalues: unknown[];
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
    keyvalues: unknown[];
  };
}

interface Pk {
  pknames: string[];
  pktypes: string[];
}

/**
 * Represents a slot that reflects the latest known server value, with no optimistic updates.
 */
export type SlotNormal<T> = {
  status: "normal";
  /**
   * The latest known server value.
   */
  value: T;
};

/**
 * Represents a slot that has had an optimistic update.
 */
export type SlotUpdated<T> = {
  status: "updated";
  /**
   * The latest known server value.
   */
  value: T;
  /**
   * The value after the optimistic update.
   */
  override: T;
};

/**
 * Represents a slot that has been deleted.
 */
export type SlotDeleted<T> = {
  status: "deleted";
  /**
   * The latest known server value.
   */
  value: T;
};

/**
 * Represents a slot that has been inserted optimistically.
 *
 * Such a slot does not correspond to a server value.
 */
export type SlotInserted<T> = {
  status: "inserted";
  /**
   * The value after the optimistic insert.
   */
  override: T;
};

type Slot<T> =
  | SlotNormal<T>
  | SlotUpdated<T>
  | SlotDeleted<T>
  | SlotInserted<T>;

function serverValue<T>(
  slot: SlotNormal<T> | SlotUpdated<T> | SlotDeleted<T>
): T;
function serverValue<T>(slot: SlotInserted<T>): undefined;
function serverValue<T>(slot: Slot<T>): T | undefined {
  switch (slot.status) {
    case "normal":
    case "updated":
    case "deleted":
      return slot.value;
    case "inserted":
      return undefined;
  }

  // Exhaustiveness check.
  const _: never = slot;
}

export type Table<R extends DBRow = DBRow> = Map<
  InferPkType<R>,
  Slot<R["$fields"]>
>;

type TableState<Row extends DBRow = DBRow> =
  | {
      status: "ready";
      info: TableInfo<Row["$meta"]["pk"]>;
      data: Table<Row>;
      notify: () => void;
    }
  | { status: "loading"; queryId: string; notify: () => void };

export class Solarflare<
  DB extends { [table: string]: DBRow } = Record<string, never>,
> {
  #socket: Socket;

  /**
   * The JWT to be used when authenticating with the server.
   */
  #jwt: string;

  tables: Map<string, TableState> = new Map();

  constructor(solarflareUrl: string, jwt: string) {
    this.#socket = io(solarflareUrl, {
      transports: ["websocket"],
    });

    this.#socket.on("connect", () => {
      console.log("Connected to the server");
    });

    this.#socket.on("disconnect", (reason) => {
      console.log(`Disconnected: ${reason}`);
      if (reason === "io server disconnect") {
        // The disconnection was initiated by the server, reconnect manually
        this.#socket.connect();
      }
    });

    this.#jwt = jwt;

    this.#socket.on(
      "bootstrap",
      <PK extends string | undefined>(msg: BootstrapMessage<PK>) => {
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

        const data = new Map();
        if (msg.pk !== undefined) {
          for (const row of msg.data) {
            const slot = { status: "normal", value: row };
            data.set(row[msg.pk], slot);
          }
        }

        this.tables.set(tableName, {
          status: "ready",
          info: msg.info,
          data,
          notify,
        });

        // Used to trigger re-renders in hooks that requested the data.
        notify();
      }
    );

    this.#socket.on("change", this.handleChange.bind(this));
  }

  table<K extends Extract<keyof DB, string>>(
    tableName: K
  ): TableState<DB[K]> | undefined {
    const localTable = this.tables.get(tableName);
    if (localTable === undefined) {
      return undefined;
    }

    if (localTable.status !== "ready") {
      return undefined;
    }

    return localTable as TableState<DB[K]>;
  }

  setJwt(jwt: string) {
    this.#jwt = jwt;
  }

  handleChange(change: Change) {
    const tableName = change.table;
    const localTable = this.table(tableName as Extract<keyof DB, string>);
    if (localTable === undefined) {
      console.error(`change received on untracked table \`${tableName}\``);
      return;
    }

    switch (change.kind) {
      case "insert":
      case "update": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix
        const o: any = {};
        change.columnnames.forEach((col, idx) => {
          o[col] = change.columnvalues[idx];
        });

        // Need to handle PKs better.
        if (localTable.status === "ready") {
          const id = o[localTable.info.pk];
          localTable.data.set(id, { status: "normal", value: o });
        } else {
          // TODO: handle pre-ready updates by caching them and replaying later.
        }
        break;
      }

      case "delete": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix
        const o: any = {};
        change.oldkeys?.keynames.forEach((col, idx) => {
          o[col] = change.oldkeys?.keyvalues[idx];
        });
        if (localTable.status === "ready") {
          const id = o[localTable.info.pk];
          localTable.data.delete(id);
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

  optimistic<T extends Extract<keyof DB, string> = Extract<keyof DB, string>>(
    change: OptimisticChangeForTable<DB, T>
  ) {
    const table = this.table(change.table);
    if (table === undefined) {
      console.error(`optimistic change on untracked table \`${change.table}\``);
      return;
    }
    if (table.status === "loading") {
      console.error(`optimistic change on loading table \`${change.table}\``);
      return;
    }

    if (table.status !== "ready") {
      // TODO: it should probably still be possible to apply optimistic changes
      // to a table that hasn't been loaded yet.
      console.error(`optimistic change on table \`${change.table}\` not ready`);
      return;
    }

    switch (change.action) {
      case "insert": {
        const pk = change[table.info.pk];
        const { data } = change;

        const row = table.data.get(pk);
        if (row !== undefined) {
          console.error(`insert on existing row \`${pk}\``);
          return;
        }
        table.data.set(pk, { status: "inserted", override: data });
        table.notify();

        break;
      }

      case "update": {
        const pk = change[table.info.pk];
        if (pk === undefined) {
          console.error(`update on row with missing PK`);
          return;
        }

        const { data } = change;

        const row = table.data.get(pk);
        if (row === undefined) {
          console.error(`update on non-existent row \`${pk}\``);
          return;
        }
        if (row.status === "deleted" || row.status === "inserted") {
          console.error(`update on deleted row \`${pk}\``);
          return;
        }

        const value = serverValue(row);
        table.data.set(pk, {
          status: "updated",
          value,
          override: { ...value, ...data },
        });
        table.notify();

        break;
      }

      case "delete": {
        const pk = change[table.info.pk];
        if (pk === undefined) {
          console.error(`update on row with missing PK`);
          return;
        }

        const row = table.data.get(pk);
        if (row === undefined) {
          console.error(`delete on non-existent row \`${pk}\``);
          return;
        }
        if (row.status === "deleted") {
          console.error(`delete on already deleted row \`${pk}\``);
          return;
        }
        if (row.status === "inserted") {
          // Since this was optimistically inserted, and now is optimistically
          // deleted, we can just remove it from the table.
          table.data.delete(pk);
        } else {
          table.data.set(pk, { status: "deleted", value: serverValue(row) });
        }
        table.notify();

        break;
      }

      // Exhaustiveness check.
      default: {
        const _: never = change;
      }
    }
  }

  clearOverride<Table extends Extract<keyof DB, string>>({
    table,
    pk,
  }: {
    table: Table;
    pk: DB[Table]["$fields"][DB[Table]["$meta"]["pk"]];
  }) {
    const localTable = this.table(table);
    if (localTable === undefined) {
      console.error(`clearOverride on untracked table \`${table}\``);
      return;
    }
    if (localTable.status === "loading") {
      console.error(`clearOverride on loading table \`${table}\``);
      return;
    }

    const slot = localTable.data.get(pk);
    if (slot === undefined) {
      console.error(`clearOverride on non-existent row \`${pk}\``);
      return;
    }
    switch (slot.status) {
      case "normal": {
        console.error(`clearOverride on normal row \`${pk}\``);
        return;
      }
      case "inserted": {
        localTable.data.delete(pk);
        return;
      }
      case "updated":
      case "deleted": {
        localTable.data.set(pk, { status: "normal", value: slot.value });
        return;
      }
      default: {
        // Exhaustiveness check.
        const _: never = slot;
      }
    }
  }
}
