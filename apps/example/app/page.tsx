"use client";

import { createSolarflare, type DB } from "@solarflare/client";

const { useTable } = createSolarflare<DB>();

export default function Home() {
  const { isLoading, data } = useTable("employees", {
    sort: (a, b) => a.name.localeCompare(b.name),
  });

  if (isLoading) {
    return <div>Loading</div>;
  }

  return (
    <div>
      <ul>
        {data.map((employee) => (
          <li key={employee.id}>{employee.name}</li>
        ))}
      </ul>
    </div>
  );
}
