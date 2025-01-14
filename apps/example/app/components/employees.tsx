"use client";
import { createSolarflare } from "@solarflare/client";
import { type DB } from "../../types/db";

const { useTable } = createSolarflare<DB>();

export const Employees = () => {
  const { isLoading, data, optimistic } = useTable("employees", {
    sort: (a, b) => a.name?.localeCompare(b.name ?? "") ?? 0,
  });

  if (isLoading) {
    return <div>Loading</div>;
  }

  const handleClick = () => {
    // Pretend you make a network request here.
    // myNetworkRequest()

    // Optimistically update the UI so we don't wait for the network request
    // to see the change.
    const { rollback } = optimistic({
      action: "update",
      uuid: 10185,
      data: { name: "Alice" },
    });

    // Pretend the network request comes back with some kind of rejection here.
    setTimeout(() => rollback(), 2000);
  };

  return (
    <div>
      <ul>
        {data.map((employee) => (
          <li key={employee.uuid}>{employee.name}</li>
        ))}
      </ul>
      <button onClick={handleClick}>Update</button>
    </div>
  );
};
