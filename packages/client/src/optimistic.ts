export type OptimisticInsert<Row extends object> = {
  action: "insert";
  // TODO: this needs to be the PK type
  id: string;
  data: Row;
};

export type OptimisticUpdate<Row extends object> = {
  action: "update";
  // TODO: this needs to be the PK type
  id: string;
  data: Partial<Row>;
};

export type OptimisticDelete = {
  action: "delete";
  // TODO: this needs to be the PK type
  id: string;
};

export type OptimisticChange<Row extends object> =
  | OptimisticInsert<Row>
  | OptimisticUpdate<Row>
  | OptimisticDelete;

export type OptimisticChangeForTable<
  DB extends Record<string, object> = Record<string, object>,
  Table extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> = OptimisticChange<DB[Table]> & { table: Table };
