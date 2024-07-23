export type OptimisticInsert<
  DB extends Record<string, unknown> = Record<string, unknown>,
  Table extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> = {
  action: "insert";
  table: Table;
  id: string;
  data: DB[Table];
};

export type OptimisticUpdate<
  DB extends Record<string, unknown> = Record<string, unknown>,
  Table extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> = {
  action: "update";
  table: Table;
  id: string;
  data: Partial<DB[Table]>;
};

export type OptimisticDelete<
  DB extends Record<string, unknown> = Record<string, unknown>,
  Table extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> = {
  action: "delete";
  table: Table;
  id: string;
};

export type OptimisticChange<
  DB extends Record<string, unknown> = Record<string, unknown>,
  Table extends Extract<keyof DB, string> = Extract<keyof DB, string>,
> =
  | OptimisticInsert<DB, Table>
  | OptimisticUpdate<DB, Table>
  | OptimisticDelete<DB, Table>;
