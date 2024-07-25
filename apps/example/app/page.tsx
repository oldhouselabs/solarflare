"use client";

import { createSolarflare, type DB } from "@solarflare/client";

const { useTable } = createSolarflare<DB>();

export default function Home() {
  const { isLoading, data, optimistic } = useTable("employees", {
    sort: (a, b) => a.name.localeCompare(b.name),
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
}
