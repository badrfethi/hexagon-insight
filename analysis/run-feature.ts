import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfiguration, runCucumber } from "@cucumber/cucumber/api";

/**
 * Runs one feature, or one scenario of it, under the `default` profile, recording what each of its
 * scenarios ran.
 *
 * `feature-runs.ts` starts this in a child process, which is the only reason it is a script of its own. It
 * cannot simply be cucumber's bin with the path on the command line: cucumber adds a command line's
 * paths to the profile's `features/**\/*.feature` rather than replacing them, so every feature would
 * run every time. Here the profile is loaded as it is and only its paths are replaced — a feature
 * file's path, or that path with `:<line>` for one scenario.
 *
 * One file is added to what the profile imports: `scenario-coverage.ts`, which records each
 * scenario's coverage to the file `INSIGHT_SCENARIOS` names. It is added here and nowhere else, so
 * the profile the gates run is untouched. It is named relative to the working directory, with
 * forward slashes, because cucumber reads its import paths as globs.
 *
 * Whether the feature passes is not this script's to report: a red feature still ran what it ran,
 * so it always exits 0 once cucumber is done, and exits explicitly so that nothing a scenario left
 * open keeps the process — and the page load waiting on it — alive.
 */
async function run(path: string): Promise<void> {
  const { runConfiguration } = await loadConfiguration();
  const { support, sources } = runConfiguration;

  await runCucumber({
    ...runConfiguration,
    sources: { ...sources, paths: [path] },
    support: { ...support, importPaths: [...(support.importPaths ?? []), RECORDER] },
  });
}

const RECORDER = relative(
  process.cwd(),
  fileURLToPath(new URL("./scenario-coverage.ts", import.meta.url)),
).replaceAll("\\", "/");

const [path] = process.argv.slice(2);

if (path === undefined) {
  throw new Error("Usage: run-feature.ts <feature path>[:line]");
}

await run(path);
process.exit(0);
