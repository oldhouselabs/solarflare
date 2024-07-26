import React from "react";
import { beforeAll, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createServer } from "node:http";
import { Server } from "socket.io";
import "@testing-library/jest-dom/vitest";

import { createSolarflare, SolarflareProvider } from "../src/hooks";

// Mock Solarflare with a basic Socket.io server.
beforeAll(() => {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe", async () => {
      socket.emit("bootstrap", {
        table: "myTable",
        info: {
          schema: "public",
          name: "myTable",
          pk: "id",
          rls: false,
        },
        pk: "id",
        data: [{ id: 1, name: "hello" }],
      });
    });
  });

  httpServer.listen(54322);
});

type DB = {
  myTable: {
    $meta: {
      pk: "id";
    };
    $fields: {
      id: number;
      name: string;
    };
  };
};

const { useTable } = createSolarflare<DB>();

const TableConsumer = () => {
  const { data } = useTable("myTable");
  if (!data) {
    return <div>Loading</div>;
  } else {
    return (
      <div>
        {data.map((item) => (
          <div key={item.id}>{item.name}</div>
        ))}
      </div>
    );
  }
};

test("useTable can be rendered multiple times on the same render cycle", async () => {
  const { container, getAllByText } = render(
    <SolarflareProvider jwt="" solarflareUrl="http://localhost:54322">
      <TableConsumer />
      <TableConsumer />
    </SolarflareProvider>
  );

  getAllByText("Loading").forEach((el) => expect(el).toBeInTheDocument());

  await waitFor(() => {
    const hellos = getAllByText("hello");
    expect(hellos).toHaveLength(2);
    hellos.forEach((el) => expect(el).toBeInTheDocument());
  });

  expect(container).toBeDefined();
});
