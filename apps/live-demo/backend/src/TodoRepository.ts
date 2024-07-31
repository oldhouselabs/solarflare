import { Insertable, Updateable } from "kysely";
import { Todos } from "kysely-codegen";
import { db } from "./database";

export const insertTodo = async (todo: Insertable<Todos>) => {
  return await db.insertInto("todos").values(todo).execute();
};

type TodoUpdate = Required<Pick<Updateable<Todos>, "id">> & Updateable<Todos>;

export const updateTodo = async (todo: TodoUpdate) => {
  return await db
    .updateTable("todos")
    .set(todo)
    .where("id", "=", todo.id)
    .execute();
};

export const deleteTodo = async (id: number) => {
  return await db.deleteFrom("todos").where("id", "=", id).execute();
};
