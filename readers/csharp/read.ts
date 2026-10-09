import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Code } from "../../analysis/model.js";
import { ReadFailure } from "../read.js";

const run = promisify(execFile);

/** This folder: the reader's project, which ships as source, as the rest of the tool does. */
const PROJECT = fileURLToPath(new URL(".", import.meta.url));

/**
 * Where the reader is built: outside the package and the target, so neither gets a `bin/` or an
 * `obj/`, and once per copy of the tool, so a second run builds nothing.
 */
const ARTIFACTS = join(
  tmpdir(),
  "hexagon-insight-csharp",
  createHash("sha256").update(PROJECT).digest("hex").slice(0, 12),
);

const DLL = join(ARTIFACTS, "bin", "HexagonInsight.CSharp", "release", "HexagonInsight.CSharp.dll");

/** The .NET CLI without its banner and its telemetry, which a reader has no use for. */
const ENV = { ...process.env, DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1" };

/** The model is a few megabytes for a large target; `execFile`'s default would cut it off. */
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * What the C# reader reads from a target's code (`analysis/model.ts`): the facts of every project
 * its solution loads, read through Roslyn by the .NET program in this folder (`Reader.cs` says how).
 *
 * The program is built here on first use with the .NET SDK on the `PATH`, which a C# target has
 * already, and it restores the target's solution before it reads it, as a build would. A target
 * without the SDK, a reader that will not build, and a solution that will not restore or load are
 * each a `ReadFailure`, naming what `dotnet` said.
 *
 * It measures no doors: a door is the class a scenario reaches the hexagon through, and C# features
 * run under Reqnroll, which this reader does not run yet: one scenario under coverage takes about
 * 43 s on crypto-trader (#16). The rules say so as a break.
 */
export async function readCSharp(root: string, solution: string): Promise<Code> {
  await dotnet(
    ["build", join(PROJECT, "HexagonInsight.CSharp.csproj"), "-c", "Release", "--artifacts-path", ARTIFACTS, "-nologo", "-v", "q"],
    "the C# reader did not build",
  );

  const output = await dotnet([DLL, root, solution], `the C# reader could not read ${solution}`);

  return JSON.parse(output) as Code;
}

async function dotnet(args: readonly string[], failure: string): Promise<string> {
  try {
    const { stdout } = await run("dotnet", args, { env: ENV, maxBuffer: MAX_BUFFER });

    return stdout;
  } catch (error) {
    const { code, stdout, stderr } = error as { code?: number | string; stdout?: string; stderr?: string };

    if (code === "ENOENT") {
      throw new ReadFailure(
        "Found no dotnet on the PATH: the C# reader runs on the .NET SDK, version 10 or later",
      );
    }

    // Exit 3 is the reader's own read failure, whose message is all of its stderr.
    if (code === 3) {
      throw new ReadFailure(stderr?.trim() ?? failure);
    }

    throw new ReadFailure(`${failure}:\n${`${stdout ?? ""}${stderr ?? ""}`.trim()}`);
  }
}
