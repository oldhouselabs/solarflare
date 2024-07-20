"use client";

import { useTable } from "@solarflare/client";

export default function Home() {
  const employees = useTable("employees");

  if (employees.loading) {
    return <div>Loading</div>;
  }

  return (
    <div>
      <ul>
        {[...employees.data.values()].map((employee) => (
          <li key={employee.id}>{employee.name}</li>
        ))}
      </ul>
    </div>
  );
}
