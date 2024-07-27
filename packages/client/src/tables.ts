import { DBRow, InferPkType, TableInfo } from "@repo/protocol-types";

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

export type Slot<T> =
  | SlotNormal<T>
  | SlotUpdated<T>
  | SlotDeleted<T>
  | SlotInserted<T>;

export type Table<R extends DBRow = DBRow> = Map<
  InferPkType<R>,
  Slot<R["$fields"]>
>;

export type TableState<Row extends DBRow = DBRow, Subscriber = unknown> =
  | {
      status: "ready";
      info: TableInfo<Row["$meta"]["pk"]>;
      data: Table<Row>;
      subscribers: Set<Subscriber>;
    }
  | { status: "loading"; queryId: string; subscribers: Set<Subscriber> };
