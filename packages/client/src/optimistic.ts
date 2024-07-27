import { DBRow } from "@repo/protocol-types";

export type OptimisticInsert<Row extends DBRow> = {
  action: "insert";
  data: Row["$fields"];
} & {
  [PK in Row["$meta"]["pk"]]: Row["$fields"][PK];
};

export type OptimisticUpdate<Row extends DBRow> = {
  action: "update";
  data: Partial<Row["$fields"]>;
} & {
  [PK in Row["$meta"]["pk"]]: Row["$fields"][PK];
};

export type OptimisticDelete<Row extends DBRow> = {
  action: "delete";
} & {
  [PK in Row["$meta"]["pk"]]: Row["$fields"][PK];
};

export type OptimisticChange<Row extends DBRow> =
  | OptimisticInsert<Row>
  | OptimisticUpdate<Row>
  | OptimisticDelete<Row>;

export type OptimisticChangeForTable<
  DB extends { [table: string]: DBRow } = Record<string, never>,
  QualifiedTable extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> = OptimisticChange<DB[QualifiedTable]> & { table: QualifiedTable };
