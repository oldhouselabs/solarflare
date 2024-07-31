import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Button } from "./Button";
import { UniqueIdentifier } from "@dnd-kit/core";
import { Item } from "./Item";

interface ContainerProps {
  id: UniqueIdentifier;
  children: React.ReactNode;
  title?: string;
  description?: string;
  onAddItem: (text: { text: string }) => void;
}

export const Lane = ({
  id,
  children,
  title,
  description,
  onAddItem,
}: ContainerProps) => {
  const { attributes, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: id,
      data: {
        type: "lane",
      },
    });
  return (
    <div
      {...attributes}
      ref={setNodeRef}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
      className={clsx(
        "w-full h-full p-4 bg-gray-50 rounded-xl flex flex-col gap-y-4",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-y-1">
          <h1 className="text-gray-800 text-xl">{title}</h1>
          <p className="text-gray-400 text-sm">{description}</p>
        </div>
      </div>

      {children}
      <AddButton onAdd={onAddItem} />
    </div>
  );
};

/**
 * Renders an Add Item button.
 *
 * When clicked, it becomes an input where you type your todo, and press enter.
 *
 * After you press enter, it calls the `onAdd` function with the todo text.
 */
const AddButton = ({
  onAdd,
}: {
  onAdd: {
    (item: { text: string }): void;
  };
}) => {
  const [isAdding, setIsAdding] = useState(false);

  const handleStartAdd = () => {
    setIsAdding(true);
  };

  const handleAdd = (title: string) => {
    onAdd({ text: title });
    setIsAdding(false);
  };

  return (
    <div className="flex flex-col w-full gap-y-4">
      {isAdding && <Item editing id={0} title="" onEdited={handleAdd} />}
      {!isAdding && (
        <Button
          className="justify-end"
          variant="ghost"
          onClick={handleStartAdd}
        >
          Add Item
        </Button>
      )}
    </div>
  );
};
