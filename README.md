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
> [Join our waitlist](https://solarflarehq.com) to be notified when we launch for production use.

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
- [ ] Optimistic update API
- [ ] In-browser local persistent storage
