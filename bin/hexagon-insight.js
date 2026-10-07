#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * `hexagon-insight serve` and `hexagon-insight rules`, run from the repository to look at.
 *
 * Each starts its TypeScript entry point under the target's own `tsx` loader and with the
 * `development` condition its source imports resolve under, the way the target runs its features.
 * Nothing is built: the package is installed as source.
 */
const COMMANDS = {
  serve: "../server.ts",
  rules: "../analysis/run-rules.ts",
};

const [command, ...rest] = process.argv.slice(2);
const entry = COMMANDS[command];

if (entry === undefined) {
  process.stderr.write("Usage: hexagon-insight <serve|rules>\n");
  process.exit(2);
}

const child = spawn(
  process.execPath,
  ["--conditions=development", "--import", "tsx", fileURLToPath(new URL(entry, import.meta.url)), ...rest],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal === null ? 1 : 128));
});
