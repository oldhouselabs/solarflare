"use client";

import { useTable } from "@solarflare/client";

export default function Home() {
  const { loading, data } = useTable("employees", {
    sort: (a, b) => a.name.localeCompare(b.name),
  });

  if (loading) {
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
