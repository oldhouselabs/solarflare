/**
 * An implementation of a Kanban board.
 *
 * This component doesn't know anything about real-time, the network, or Solarflare.
 *
 * To understand the Solarflare live demo, you don't need to read this file in
 * detail. Think of this as an off-the-shelf Kanban component, you might have
 * installed from npm. State is managed outside this component, and the insert,
 * update and delete actions are passed in as props.
 *
 * Look at the file `MyKanban.tsx` to see how this gets used in combination with
 * Solarflare to create a real-time Kanban board.
 */

import { useState } from "react";

import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  UniqueIdentifier,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { Lane } from "./Lane";
import { Item } from "./Item";
import { LexoRank } from "lexorank";

type Status = "todo" | "in-progress" | "done";

type Item = {
  id: number;
  text: string;
  status: Status;
  rank: string;
};

type Lane = {
  id: UniqueIdentifier;
  status: Status;
  title: string;
};

const LANES: Lane[] = [
  {
    id: "lane-1",
    title: "Todo",
    status: "todo",
  },
  {
    id: "lane-2",
    title: "In Progress",
    status: "in-progress",
  },
  {
    id: "lane-3",
    title: "Done",
    status: "done",
  },
];

class CustomPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent: event }: React.PointerEvent,
        { activationConstraint }: any
      ) => {
        // Check if the target element or any of its ancestors has the data-dnd-disable attribute
        let element = event.target as HTMLElement | null;
        while (element) {
          if (element.getAttribute("data-dnd-disable") === "true") {
            return false; // Disable activation
          }
          element = element.parentElement;
        }
        return true; // Allow activation
      },
    },
  ];
}

export interface KanbanProps {
  items: Item[];
  onUpdate: (
    action: "drag-move" | "drag-end",
    data: Partial<Item> & Pick<Item, "id">
  ) => void;
  onInsert: (item: Omit<Item, "id">) => void;
  onDelete: (data: Pick<Item, "id">) => void;
}

/**
 * A Kanban board rendering a collection of draggable items.
 */
export const Kanban = ({
  items,
  onInsert,
  onUpdate,
  onDelete,
}: KanbanProps) => {
  const [activeItemInitialState, setActiveItemInitialState] =
    useState<Item | null>(null);

  const sensors = useSensors(
    useSensor(CustomPointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedItems = items.slice().sort((a, b) => {
    return a.rank.localeCompare(b.rank);
  });

  const handleAddItem =
    (status: Status) => (item: { text: string; rank: LexoRank }) => {
      onInsert({
        text: item.text,
        rank: item.rank.toString(),
        status,
      });
    };

  const handleDeleteItem = (id: number) => {
    onDelete({ id });
  };

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const activeItem = sortedItems.find((item) => item.id === active.id);
    if (!activeItem) return;
    setActiveItemInitialState({ ...activeItem });
  }

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;

    if (active.id === over?.id) return;

    // Handle item sorting
    if (over?.data.current?.type === "item") {
      // Find the active item and over item
      const activeItem = sortedItems.find((item) => item.id === active.id);
      const overItem = sortedItems.find((item) => item.id === over.id);

      // If the active or over item is not found, return
      if (!activeItem || !overItem) return;

      // In the same lane
      if (activeItem.status === overItem.status) {
        const laneItems = sortedItems.filter(
          (item) => item.status === activeItem.status
        );

        const overItemIndex = laneItems.findIndex(
          (item) => item.id === over.id
        );

        // Different behaviour depending if the active item is before or after
        // the over item.
        const activeIsAfter = activeItem.rank.localeCompare(overItem.rank) > 0;

        if (activeIsAfter) {
          // In this case, over moves down, so we need to find the rank of the
          // item before over.
          const aboveOverItemIndex = overItemIndex - 1;
          const aboveOverItemRank =
            aboveOverItemIndex < 0
              ? LexoRank.min()
              : LexoRank.parse(laneItems[aboveOverItemIndex]!.rank);
          const overItemRank = LexoRank.parse(overItem.rank);
          const newRank = aboveOverItemRank.between(overItemRank);

          onUpdate("drag-move", {
            id: activeItem.id,
            status: activeItem.status,
            rank: newRank.toString(),
          });
        } else {
          // In this case, over moves up, so we need to find the rank of the item after over
          const belowOverItemIndex = overItemIndex + 1;
          const belowOverItemRank =
            belowOverItemIndex >= laneItems.length
              ? LexoRank.max()
              : LexoRank.parse(laneItems[belowOverItemIndex]!.rank);
          const overItemRank = LexoRank.parse(overItem.rank);
          const newRank = overItemRank.between(belowOverItemRank);

          onUpdate("drag-move", {
            id: activeItem.id,
            status: activeItem.status,
            rank: newRank.toString(),
          });
        }
      } else {
        // In different lanes
        const targetLaneItems = sortedItems.filter(
          (lane) => lane.status === overItem.status
        );

        const overItemIndex = targetLaneItems.findIndex(
          (item) => item.id === over.id
        );

        // Moving to a different lane means removing the item from the
        // current lane and adding it to the new lane. We always move
        // the over item down since the active item came from a different
        // lane.
        const aboveOverItemIndex = overItemIndex - 1;
        const aboveOverItemRank =
          aboveOverItemIndex < 0
            ? LexoRank.min()
            : LexoRank.parse(targetLaneItems[aboveOverItemIndex]!.rank);

        const overItemRank = LexoRank.parse(overItem.rank);
        const newRank = aboveOverItemRank.between(overItemRank);

        onUpdate("drag-move", {
          id: activeItem.id,
          status: overItem.status,
          rank: newRank.toString(),
        });
      }
    }
    // Handling Item Moving Into a Lane
    if (over?.data.current?.type === "lane") {
      // In this case, this item is becoming the only item in the lane,
      // so we don't need to change its rank.
      const overLane = LANES.find((lane) => lane.id === over.id);
      if (!overLane) return;

      const activeItem = sortedItems.find((item) => item.id === active.id);
      if (!activeItem) return;

      onUpdate("drag-move", {
        id: activeItem.id,
        status: overLane.status,
      });
    }
  };

  // This is the function that handles the sorting of the lanes and items when the user is done dragging.
  function handleDragEnd(event: DragEndEvent) {
    const { active } = event;
    const activeItem = sortedItems.find((item) => item.id === active.id);
    if (!activeItem) return;

    onUpdate("drag-end", {
      id: activeItem.id,
      status: activeItem.status,
      rank: activeItem.rank,
    });

    setActiveItemInitialState(null);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <div className="grid grid-cols-3 gap-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            {LANES.map((lane) => (
              <KanbanLane
                lane={lane}
                items={sortedItems.filter((i) => i.status === lane.status)}
                key={lane.id}
                onAddItem={handleAddItem(lane.status)}
                onDeleteItem={handleDeleteItem}
              />
            ))}
          </DndContext>
        </div>
      </div>
    </div>
  );
};

const KanbanLane = ({
  lane,
  items,
  onAddItem,
  onDeleteItem,
}: {
  lane: Lane;
  items: Item[];
  onAddItem: (item: { text: string; rank: LexoRank }) => void;
  onDeleteItem: (id: number) => void;
}) => {
  const sorted = items.sort((a, b) => {
    return a.rank.localeCompare(b.rank);
  });

  const handleAddItem = ({ text }: { text: string }) => {
    let rank: LexoRank;
    if (sorted.length === 0) {
      rank = LexoRank.middle();
    } else {
      const lastRank = LexoRank.parse(sorted[sorted.length - 1]!.rank);
      rank = lastRank.between(LexoRank.max());
    }

    onAddItem({
      text,
      rank,
    });
  };

  const handleDelete = (id: number) => {
    onDeleteItem(id);
  };

  return (
    <Lane id={lane.id} title={lane.title} onAddItem={handleAddItem}>
      <SortableContext items={sorted}>
        <div className="flex items-start flex-col gap-y-4 flex-1">
          {sorted.map((i) => (
            <Item title={i.text} id={i.id} key={i.id} onDelete={handleDelete} />
          ))}
        </div>
      </SortableContext>
    </Lane>
  );
};
