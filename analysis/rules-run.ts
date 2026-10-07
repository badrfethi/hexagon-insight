import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The parts of cucumber's message stream that insight reads to find a failing scenario. Everything
 * else in an envelope is left untyped and ignored.
 */
export interface Envelope {
  readonly gherkinDocument?: {
    readonly feature?: { readonly children: readonly FeatureChild[] };
  };
  readonly pickle?: {
    readonly id: string;
    readonly uri: string;
    readonly name: string;
    readonly astNodeIds: readonly string[];
  };
  readonly testCase?: { readonly id: string; readonly pickleId: string };
  readonly testCaseStarted?: { readonly id: string; readonly testCaseId: string };
  readonly testStepFinished?: {
    readonly testCaseStartedId: string;
    readonly testStepResult: { readonly status: string; readonly message?: string };
  };
  readonly testRunFinished?: { readonly success: boolean };
}

export interface FeatureChild {
  readonly rule?: {
    readonly name: string;
    readonly children: readonly { readonly scenario?: { readonly id: string } }[];
  };
}

/** What one run of the rules said: its envelopes, and what it wrote to stderr in case it said none. */
export interface RulesRun {
  readonly envelopes: readonly Envelope[];
  readonly stderr: string;
}

/**
 * Runs the rules the way `hexagon-insight rules` does (`run-rules.ts`), in a child process, adding a message
 * formatter to a temporary file.
 *
 * A child process, not cucumber's API in this one, because the steps and the code they read must be
 * loaded fresh on every page load: this server stays up while the code under it changes (#74,
 * decision 4). The run exits non-zero whenever a rule breaks, which is the ordinary case here, so
 * the exit code is not read — the messages are.
 */
export async function runRules(root: string): Promise<RulesRun> {
  const directory = await mkdtemp(join(tmpdir(), "insight-rules-"));
  const messages = join(directory, "messages.ndjson");

  try {
    const stderr = await cucumber(root, messages);

    return { envelopes: await envelopesIn(messages), stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function cucumber(root: string, messages: string): Promise<string> {
  const child = spawn(
    process.execPath,
    [
      "--conditions=development",
      "--import",
      "tsx",
      RUNNER_SCRIPT,
      `message:${messages}`,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
  );
  const chunks: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

  return new Promise((resolve) => {
    child.on("close", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

const RUNNER_SCRIPT = fileURLToPath(new URL("./run-rules.ts", import.meta.url));

async function envelopesIn(file: string): Promise<readonly Envelope[]> {
  const text = await readFile(file, "utf8").catch(() => "");

  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Envelope);
}
