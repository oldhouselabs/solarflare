<p align="center">
  <a href="https://solarflarehq.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_dark.png">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
      <img alt="Solarflare Logo" width="300" src="https://raw.githubusercontent.com/solarflare-dev/solarflare/main/packages/common/assets/images/solarflare_logotext_light.png">
    </picture>

  </a>

  <h1 align="center">solarflared</h1>

  <p align="center">
    Stream <strong>real-time data to your React app</strong> from your existing Postgres database.
    <br />
    <br />
    <a href="https://www.npmjs.com/package/@solarflare/solarflared">
        <img alt="npm version" src="https://img.shields.io/npm/v/@solarflare/solarflared.svg?style=flat&color=blue" />
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

**solarflared** is a server-side daemon process that sits alongside your existing Postgres database. It listens for changes to your 'live' tables and broadcasts them via WebSockets to connected clients (see the [Solarflare Typescript Client](https://github.com/solarflare-dev/solarflare/tree/main/packages/client)).

Packaged with `solarflared` is a CLI tool for managing your installation.

## Features

- [x] Postgres logical replication
- [x] WebSocket server
- [x] JWT-based auth for partial replication
- [x] CLI
- [x] Typescript codegen
