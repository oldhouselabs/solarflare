import { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import React, { useEffect, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

type ItemsType = {
  id: number;
  title: string;
  editing?: boolean;
  onEdited?: (title: string) => void;
  onDelete?: (id: number) => void;
};

export const Item = ({
  id,
  title,
  editing = false,
  onEdited,
  onDelete,
}: ItemsType) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    disabled: editing,
    id: id,
    data: {
      type: "item",
    },
  });

  const [editingTitle, setEditingTitle] = useState("");

  const handleFinishEditing = () => {
    if (editingTitle.trim() === "") {
      return;
    }

    if (onEdited) {
      onEdited(editingTitle);
    }

    setEditingTitle("");
  };

  // When editing, we intercept enter key.
  useEffect(() => {
    if (editing && onEdited) {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          handleFinishEditing();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [editing, onEdited, handleFinishEditing]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
      className={clsx(
        "group focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600 px-2 py-4 bg-white shadow-md rounded-xl w-full border border-transparent hover:border-gray-200 cursor-pointer",
        isDragging && "z-50"
      )}
    >
      {!editing && (
        <div className="relative">
          <div className="flex items-center justify-between">
            {title}
            <div
              className="absolute right-0 -my-4 h-8 w-8 p-1.5 hidden group-hover:block rounded text-gray-300 group-hover:bg-gray-50 hover:bg-gray-100 hover:text-gray-400"
              data-dnd-disable="true"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete && onDelete(id);
              }}
            >
              <TrashIcon />
            </div>
          </div>
        </div>
      )}
      {editing && (
        <input
          type="text"
          placeholder="Do something people want..."
          className="h-full w-full ring-0 focus:ring-0 focus:outline-none"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          autoFocus
          onBlur={handleFinishEditing}
        />
      )}
    </div>
  );
};

const TrashIcon = () => {
  return (
    <svg
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      fill="currentColor"
      viewBox="0 0 256 256"
    >
      <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path>
    </svg>
  );
};
