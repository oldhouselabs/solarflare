import React from "react";

type Status = "todo" | "in-progress" | "done";
type Item = {
  id: number;
  text: string;
  status: Status;
  rank: string;
  created_at: any;
};

const sortStatus = (a: Status, b: Status) => {
  const statusMap: Record<Status, number> = {
    todo: 0,
    "in-progress": 1,
    done: 2,
  };

  return statusMap[a] - statusMap[b];
};

export const DBTable = ({ items }: { items: Item[] }) => {
  const sortedItems = items
    .slice()
    .sort(
      (a, b) => sortStatus(a.status, b.status) || a.rank.localeCompare(b.rank)
    );

  return (
    <div>
      <h1 className="font-bold text-lg">Postgres</h1>
      <table className="w-full">
        <thead>
          <tr>
            <th>id</th>
            <th>text</th>
            <th>status</th>
            <th>rank</th>
            <th>created_at</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Row = ({ item }: { item: Item }) => {
  const parsedDate = new Date(item.created_at);

  // Format as `YYYY-MM-DD HH:MM:SS` including padding
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth().toString().padStart(2, "0");
  const date = parsedDate.getDate().toString().padStart(2, "0");
  const hours = parsedDate.getHours().toString().padStart(2, "0");
  const minutes = parsedDate.getMinutes().toString().padStart(2, "0");
  const seconds = parsedDate.getSeconds().toString().padStart(2, "0");
  const formattedDate = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;

  return (
    <tr>
      <td>{item.id}</td>
      <td>{item.text}</td>
      <td>{item.status}</td>
      <td>{item.rank}</td>
      <td>{formattedDate}</td>
    </tr>
  );
};
