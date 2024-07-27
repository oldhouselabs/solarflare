import { z } from "zod";

/**
 * A uniquely identifying reference to a table in Postgres.
 */
export type TableRef = {
  /**
   * Which PG schema this table belongs to.
   */
  schema: string;
  /**
   * The name of the table.
   */
  name: string;
};

type TableRefAsStringOptions = {
  renderPublic?: boolean;
};

export const asString = (ref: TableRef, options?: TableRefAsStringOptions) => {
  if (!options?.renderPublic && ref.schema === "public") {
    return `${ref.name}`;
  }
  return `${ref.schema}.${ref.name}`;
};

/**
 * Create a TableRef object from a qualified name.
 *
 * If no schema is provided, the schema is assumed to be "public".
 *
 * @param qualifiedName A string in the format "schema.table" or "table".
 * @returns A TableRef object.
 */
export const refFromQualifiedName = (qualifiedName: string): TableRef => {
  const split = qualifiedName.split(".");
  if (split.length > 2) {
    throw new Error(`Invalid qualified name: ${qualifiedName}`);
  }
  const [first, second] = split;

  if (second === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- must be defined.
    return { schema: "public", name: first! };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- must be defined.
    return { schema: first!, name: second };
  }
};

export type TableInfo<PK extends string = string> = {
  ref: TableRef;
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

/**
 * A reference to a table in Postgres.
 */
export const tableRefZ = z.object({
  schema: z.string().min(1),
  name: z.string().min(1),
});

/**
 * A message requesting an ongoing subscription to a table.
 */
export const subscribeMessageZ = z.object({
  queryId: z.string(),
  ref: tableRefZ,
  jwt: z.string(),
});
export type SubscribeMessage = z.infer<typeof subscribeMessageZ>;

/**
 * A message returned from the server when a subscription is started.
 *
 * Contains the table information and initial data.
 */
export const bootstrapMessageZ = z.object({
  info: z.object({
    ref: tableRefZ,
    pk: z.string().min(1),
    rls: z.union([z.string(), z.literal(false)]),
  }),
  data: z.array(z.object({})),
});

/**
 * A message returned from the server when a subscription is started.
 */
export type BootstrapMessage<
  PK extends string | undefined = string | undefined,
> = {
  info: TableInfo;
  data: (PK extends string ? { [K in PK]: number } : object) &
    Record<string, unknown>[];
};

type _ = AssertAssignable<BootstrapMessage, z.infer<typeof bootstrapMessageZ>>;

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

export type Row<
  DB extends { [table: string]: DBRow },
  Row extends string,
> = DB[Row]["$fields"];

export type InferPk<Row extends DBRow> = Row["$meta"]["pk"];
export type InferPkType<Row extends DBRow> = Row["$fields"][InferPk<Row>];

export class Tables<V> {
  #tables: Map<string, Map<string, V>>;

  constructor() {
    this.#tables = new Map();
  }

  set(tableRef: TableRef, value: V) {
    const schema = this.#tables.get(tableRef.schema);
    if (schema === undefined) {
      this.#tables.set(tableRef.schema, new Map([[tableRef.name, value]]));
    } else {
      schema.set(tableRef.name, value);
    }
  }

  get(tableRef: TableRef) {
    const schema = this.#tables.get(tableRef.schema);
    if (schema === undefined) {
      return undefined;
    }
    return schema.get(tableRef.name);
  }

  has(tableRef: TableRef) {
    const schema = this.#tables.get(tableRef.schema);
    if (schema === undefined) {
      return false;
    }
    return schema.has(tableRef.name);
  }

  // Makes the Tables class iterable
  *[Symbol.iterator](): Generator<{ ref: TableRef; value: V }> {
    for (const [schema, tables] of this.#tables) {
      for (const [table, value] of tables) {
        yield { ref: { schema, name: table }, value };
      }
    }
  }
}

// TODO: move to a type-utils package.
/**
 * Compile-time check that type `U` is assignable to type `T`.
 */
export type AssertAssignable<T, U extends T> = U;
