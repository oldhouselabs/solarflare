export type TableInfo<PK extends string = string> = {
  /**
   * Which PG schema this table belongs to.
   */
  schema: string;
  /**
   * The name of the table.
   */
  name: string;
  /**
   * The name of the primary key column.
   */
  pk: PK;
  /**
   * The name of the column which is used for RLS on this table.
   *
   * If `false`, then this table does not have RLS.
   */
  rls: string | false;
};

export type BootstrapMessage<
  PK extends string | undefined = string | undefined,
> = {
  table: string;
  info: TableInfo;
  pk: PK;
  data: (PK extends string ? { [K in PK]: number } : object) &
    Record<string, unknown>[];
};

export type DBRow<
  PK extends string = string,
  Fields extends Record<string, unknown> & { [K in PK]: unknown } = Record<
    string,
    unknown
  > & { [K in PK]: unknown },
> = {
  $meta: {
    pk: PK;
  };
  $fields: Fields;
};

type Row<
  DB extends { [table: string]: DBRow },
  Row extends string,
> = DB[Row]["$fields"];

export type InferPk<Row extends DBRow> = Row["$meta"]["pk"];
export type InferPkType<Row extends DBRow> = Row["$fields"][InferPk<Row>];

type MyDB = {
  users: {
    $meta: {
      pk: "id";
    };
    $fields: {
      id: number;
      name: string;
      surname: string;
      age: number;
    };
  };
  posts: {
    $meta: {
      pk: "id";
    };
    $fields: {
      id: number;
      title: string;
      author_id: number;
    };
  };
};

type Users = Row<MyDB, "users">;
type UsersPK = InferPk<MyDB["users"]>;
type UsersPKType = Users[UsersPK];
