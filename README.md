<p align="center">
  <a href="https://solarflarehq.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_dark.png">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
      <img alt="Solarflare Logo" width="300" src="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
    </picture>

  </a>

  <p align="center">
    Stream <strong>real-time data to your React app</strong> from your existing Postgres database.
    <br />
    <br />
    <a href="https://www.npmjs.com/package/@solarflare/client">
        <img alt="npm version" src="https://img.shields.io/npm/v/@solarflare/solarflared.svg?style=flat&color=blue&label=solarflared" />
    </a>
    <a href="https://www.npmjs.com/package/@solarflare/client">
        <img alt="npm version" src="https://img.shields.io/npm/v/@solarflare/client.svg?style=flat&color=blue&label=client" />
    </a>
    <a href="https://discord.gg/aEYYq3na">
        <img alt="Discord" src="https://img.shields.io/discord/1263999921871126528?style=flat&color=blue&logo=discord&label=discord" />
    </a>
    <br />
    <p align="center">
    <a alt="Request Feature" href="https://discord.com/channels/1263999921871126528/1263999921871126531">Request Feature</a>
    &middot;
    <a alt="Report Bug" href="https://discord.com/channels/1263999921871126528/1264281148322877450">Report Bug</a>
    </p>
  </p>
</p>

> [!WARNING]
> This code is in active development and is not yet production-ready.
>
> If you're excited by what we're building, we're looking for design partners - contact us if you want early access to Solarflare.
>
> [Join our waitlist](https://solarflarehq.com#signup) to be notified when we launch for production use.

## Introduction

**[Solarflare](https://solarflarehq.com)** is a lightweight system allowing you to **stream realtime data to your React app** from your existing Postgres database.

Solarflare is distributed as two packages:

- [`@solarflare/solarflared`](https://github.com/solarflare-dev/solarflare/tree/main/apps/solarflared) ([npm](https://www.npmjs.com/package/@solarflare/solarflared)) &mdash; daemon process to manage client connections and perform partial data replication from Postgres to clients
- [`@solarflare/client`](https://github.com/solarflare-dev/solarflare/tree/main/packages/client) ([npm](https://www.npmjs.com/package/@solarflare/client)) &mdash; fully-typed client for TypeScript React frontends.

## Installation

Installation is as simple as:

- `solarflare init`
  - select which Postgres tables to make live
  - configure auth so that only authorised rows are replicated to clients
- `solarflare start`
- A few lines of React code with `@solarflare/client`

```tsx
import { useTable } from '@solarflare/client'

const Todos = () => {
    const { data, isLoading } = useTable("todos") // <- fully-typed API

    return (
        <div>
            {data.map(todo => <Todo key={todo.id} todo={todo}>)}
        </div>
    )
}
```

Now, if a row is added, deleted or edited in Postgres, the `Todos` component will automatically and instantly re-render with the changes. You don't have to do anything else.

## "Look at all the things I'm _not_ doing."

- ✅ Don't think about the network
- ✅ Don't configure WebSockets or invent a communication protocol
- ✅ Don't figure out how to replicate just the relevant rows
- ✅ Don't spend days learning about the guts of [Postgres logical replication](https://www.postgresql.org/docs/current/logical-replication.html)
- ✅ Don't get a PhD in fault-tolerant distributed systems
- ✅ Don't be a Postgres database admin

## Features

- [x] [`@solarflare/solarflared`](https://github.com/solarflare-dev/solarflare/tree/main/apps/solarflared) &mdash; daemon process to manage client connections and perform partial data replication from Postgres to clients
- [x] [`@solarflare/client`](https://github.com/solarflare-dev/solarflare/tree/main/packages/client) &mdash; fully-typed client for TypeScript React frontends
- [x] Live, declarative view of your existing Postgres tables with minimal setup
- [x] JWT-based auth for partial replication
- [x] Optimistic update API
- [ ] In-browser local persistent storage

## Getting started

1. Install the Solarflare CLI:

   ```sh
   npm install -g @solarflare/solarflared
   ```

1. Initialize Solarflare in your backend project:

   ```sh
   solarflare init
   ```

   This command will interactively allow you to configure which tables you want to expose to your frontend, and ensures that your Postgres installation works with Solarflare. In particular, you need to have logical replication enabled with `wal_level = logical` in your `postgresql.conf` file (this requires a Postgres restart).

   Each table can have row-level security configured. Currently, this works by nominating a column as the `rls` column and a [JWT claim](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-token-claims) to use for filtering. When a user on your frontend loads a table from Solarflare, they will only see rows where the `rls` column matches the claim in their JWT.

   The command generates a `solarflare.json` file in your project root, which you can commit to your version control system.

1. Run the Solarflare server:

   ```sh
   solarflare start
   ```

   This will start the Solarflare server on `http://localhost:54321`. It reads the `solarflare.json` configuration file.

1. Install the Solarflare client in your frontend project:

   ```sh
    npm install @solarflare/client
   ```

1. Generate types for your tables:

   ```sh
   solarflare codegen
   ```

1. Setup a `SolarflareProvider` in your React app.

   This needs to be somewhere high up in your component tree, so that all components that use Solarflare are descendants of it. If your project is a Next.js app, you could put it in `_app.tsx`, or `layout.tsx`.

   ```tsx
   import { SolarflareProvider } from "@solarflare/client";

   const App = ({ Component, pageProps }) => {
     const usersJwt = "...";

     return (
       <SolarflareProvider
         jwt={usersJwt}
         solarflareUrl="http://localhost:54321"
       >
         <Component {...pageProps} />
       </SolarflareProvider>
     );
   };
   ```

   The `jwt` prop is the JWT that Solarflare will use to filter rows in your tables.

1. Use the `useTable` hook in your components to get live data from your Postgres tables.

   ```tsx
   import { createSolarflare, type DB } from '@solarflare/client'

   const { useTable } = createSolarflare<DB>()

   const Todos = () => {
       const { data, isLoading } = useTable("todos");

       if (isLoading) return <div>Loading...</div>

       return (
           <div>
               {data.map(todo => <Todo key={todo.id} todo={todo}>)}
           </div>
       )
   }
   ```

### Optimistic updates

Solarflare supports optimistic updates. Our philosophy is one of pragmatism. We don't attempt to solve the general case of conflict resolution, or be a full-blown ORM where you just edit the values of object fields and expect everything to happen by magic.

Instead, for live changing data, the model we encourage is:

- You have a server which performs writes
- The server exposes an API which you can call to perform writes (e.g. REST, GraphQL, tRPC)
- When you render the page, you fetch the data via Solarflare and get a declarative view to render in a natural way
- When a user does an action, you call your (non-Solarflare) API to request the change
- Your server performs whatever complex validation, authorization or conflict resolution logic is necessary
- Your server writes the change to the database
- The database, being the source of truth for the state of your data, pushes changes out via Solarflare to everybody who needs to know
- Meanwhile, your frontend client can optimistically render the updated value with a couple of lines of Javascript. When the ratified change comes back via Solarflare, the optimistic update is replaced with the real data

Here's how you do an optimistic update with Solarflare:

```tsx
const Todos = () => {
  const { data, optimistic } = useTable("todos");

  const updateTodo = async (id: number, text: string) => {
    // Perhaps do some client-side validation here...

    // Optimistically update the UI
    const { rollback } = optimistic({
      action: "update",
      id,
      data: { text },
    });

    const res = /* call your normal API here */;

    // If the server responds with an error, roll back the optimistic update
    if (res.error) {
      rollback();
    }
  };

  return (
    <div>
      {data.map((todo) => (
        <Todo key={todo.id} todo={todo} updateTodo={updateTodo} />
      ))}
    </div>
  );
};
```
