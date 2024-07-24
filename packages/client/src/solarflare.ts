// Socket.io client that connects to the backend and accepts
// generic types as produced by the `solarflare introspect`
// command, to produce a strongly typed client.

import { io, Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

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

export type Table<Row = unknown> = Map<string, Slot<Row>>;

type TableState<Row = unknown> =
  | { status: "ready"; data: Table<Row>; notify: () => void }
  | { status: "loading"; queryId: string; notify: () => void };

export class Solarflare<
  DB extends Record<string, object> = Record<string, object>,
> {
  #socket: Socket;

  /**
   * The JWT to be used when authenticating with the server.
   */
  #jwt: string;

  tables: Map<string, TableState> = new Map();

  constructor(solarflare_url: string, jwt: string) {
    this.#socket = io(solarflare_url, {
      transports: ["websocket"],
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

      const data = new Map();
      for (const row of msg.data) {
        const slot = { status: "normal", value: row };
        data.set(row.id, slot);
      }

      this.tables.set(tableName, {
        status: "ready",
        data,
        notify,
      });

      // Used to trigger re-renders in hooks that requested the data.
      notify();
    });

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

        // TODO: this fails when you don't have an ID column.
        // Need to handle PKs better.
        const id = o.id;
        if (localTable.status === "ready") {
          localTable.data.set(id, { status: "normal", value: o });
        }
        break;
      }

      case "delete": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: fix
        const o: any = {};
        change.oldkeys?.keynames.forEach((col, idx) => {
          o[col] = change.oldkeys?.keyvalues[idx];
        });
        const id = o.id;
        if (localTable.status === "ready") {
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
        const { id, data } = change;

        const row = table.data.get(id);
        if (row !== undefined) {
          console.error(`insert on existing row \`${id}\``);
          return;
        }
        table.data.set(id, { status: "inserted", override: data });
        table.notify();

        break;
      }

      case "update": {
        const { id, data } = change;

        const row = table.data.get(id);
        if (row === undefined) {
          console.error(`update on non-existent row \`${id}\``);
          return;
        }
        if (row.status === "deleted" || row.status === "inserted") {
          console.error(`update on deleted row \`${id}\``);
          return;
        }

        const value = serverValue(row);
        table.data.set(id, {
          status: "updated",
          value,
          override: { ...value, ...data },
        });
        table.notify();

        break;
      }

      case "delete": {
        const { id } = change;

        const row = table.data.get(id);
        if (row === undefined) {
          console.error(`delete on non-existent row \`${id}\``);
          return;
        }
        if (row.status === "deleted") {
          console.error(`delete on already deleted row \`${id}\``);
          return;
        }
        if (row.status === "inserted") {
          // Since this was optimistically inserted, and now is optimistically
          // deleted, we can just remove it from the table.
          table.data.delete(id);
        } else {
          table.data.set(id, { status: "deleted", value: serverValue(row) });
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

  clearOverride({
    table,
    id,
  }: {
    table: Extract<keyof DB, string>;
    id: string;
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

    const slot = localTable.data.get(id);
    if (slot === undefined) {
      console.error(`clearOverride on non-existent row \`${id}\``);
      return;
    }
    switch (slot.status) {
      case "normal": {
        console.error(`clearOverride on normal row \`${id}\``);
        return;
      }
      case "inserted": {
        localTable.data.delete(id);
        return;
      }
      case "updated":
      case "deleted": {
        localTable.data.set(id, { status: "normal", value: slot.value });
        return;
      }
      default: {
        // Exhaustiveness check.
        const _: never = slot;
      }
    }
  }
}
