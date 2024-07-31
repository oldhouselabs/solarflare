import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType("Status")
    .asEnum(["todo", "in-progress", "done"])
    .execute();

  await db.schema
    .createTable("todos")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("status", sql`"Status"`, (col) => col.notNull())
    .addColumn("rank", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("todos").execute();
  await db.schema.dropType("Status").execute();
}
