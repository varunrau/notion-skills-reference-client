#!/usr/bin/env node
import { parseArgs } from "node:util";
import { syncPlugins } from "./sync";

function usage(): never {
  console.error(`Usage:
  pnpm reference-client sync --base-url <url> --output <path> [--token <token>] [--dry-run]

The token defaults to DEMO_API_TOKEN when that environment variable is set.`);
  process.exit(1);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "sync") usage();

  const { values } = parseArgs({
    args,
    options: {
      "base-url": { type: "string" },
      output: { type: "string" },
      token: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) usage();
  if (!values["base-url"] || !values.output) usage();

  await syncPlugins({
    baseUrl: values["base-url"],
    output: values.output,
    token: values.token ?? process.env.DEMO_API_TOKEN,
    dryRun: values["dry-run"],
  });
}

main().catch((error) => {
  console.error(`sync failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
