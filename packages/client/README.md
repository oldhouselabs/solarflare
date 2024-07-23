<p align="center">
  <a href="https://solarflarehq.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_dark.png">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
      <img alt="Solarflare Logo" width="300" src="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
    </picture>

  </a>

  <h1 align="center">Typescript Client</h1>

  <p align="center">
    Stream <strong>real-time data to your React app</strong> from your existing Postgres database.
    <br />
    <br />
    <a href="https://www.npmjs.com/package/@solarflare/client">
        <img alt="npm version" src="https://img.shields.io/npm/v/@solarflare/client.svg?style=flat&color=blue" />
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

The **Solarflare Typescript Client** is a fully-typed client you can use from your frontend React app to get a live view of your Postgres tables. Any changes to the Postgres tables - no matter what triggered them - will flow through to the React app in real-time and trigger a re-render.

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

That's it! If a row is added, deleted or edited in Postgres, this component will re-render with the changes. You don't have to do anything else.

(Okay, you _do_ have to set up a `<Provider />` and run the Solarflare server, but that's pretty easy too.)

## Features

- [x] Fully-typed client (use [`@solarflare/solarflared`](https://github.com/solarflare-dev/solarflare/tree/main/apps/solarflared) to generate types and run the Solarflare server)
- [x] Live, declarative view of your existing Postgres tables with minimal setup
- [x] JWT-based auth for partial replication
- [ ] Optimistic update API
- [ ] In-browser local persistent storage
