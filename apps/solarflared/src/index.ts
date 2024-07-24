#!/usr/bin/env node
import { Command } from "commander";
import { config as loadEnv } from "dotenv";

import { init } from "./init";
import { start } from "./start";
import { codegen } from "./codegen";

// Load .env file.
loadEnv();

// Create the program instance.
const program = new Command();

program
  .name("solarflared")
  .description(
    "The Solarflare daemon. Stream live updates of your Postgres data."
  )
  .version("0.1.0");

program.command("init").description("Initialize solarflared").action(init);
program
  .command("start")
  .description("Start the Solarflare daemon")
  .action(start);
program
  .command("codegen")
  .description("Introspect Postgres and produce Typescript types")
  .action(codegen);

program.parseAsync().then(() => process.exit(0));
