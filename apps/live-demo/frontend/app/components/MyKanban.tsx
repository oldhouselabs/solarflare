import React from "react";
import { Kanban } from "./Kanban";
import { DBTable } from "./DBTable";
import { useTable } from "../solarflare";
import { trpc } from "../trpc";

type Status = "todo" | "in-progress" | "done";
type Todo = {
  id: number;
  text: string;
  status: Status;
  rank: string;
  created_at: any;
};

export const MyKanban = () => {
  const { data: items, isLoading, optimistic } = useTable("todos");

  const insertItem = trpc.insertItem.useMutation();
  const updateItem = trpc.updateItem.useMutation();
  const deleteItem = trpc.deleteItem.useMutation();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const onUpdate = (
    action: "drag-move" | "drag-end",
    data: Partial<Todo> & Pick<Todo, "id">
  ) => {
    if (action === "drag-move") {
      // A `drag-move` action is triggered during drag operations, such as when
      // the item moves from one lane to another. We don't send this to the
      // server.

      // Uncomment this if you want dragging to be local-only, and to sync state
      // when the user drops the item.
      // optimistic({ action: "update", id: data.id, data });

      // Comment this out if you don't want to sync state on drag-move.
      updateItem.mutate(data);
    } else if (action === "drag-end") {
      // A `drag-end` action is triggered when the drag operation is completed.
      updateItem.mutate(data);
    }
  };

  return (
    <>
      <Kanban
        items={items}
        onInsert={insertItem.mutate}
        onUpdate={onUpdate}
        onDelete={deleteItem.mutate}
      />
      <DBTable items={items} />
    </>
  );
};
