import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ReadFailure, readOnce } from "../readers/read.js";
import { RULES } from "./rules.js";

/**
 * `hexagon-insight rules`: runs this package's rules (`rules.ts`) with its steps, over the
 * repository it is started in. It exits 1 when a rule breaks, and 2 when the target cannot be read
 * into a model at all (`ReadFailure`), which it reads first, so that a target the tool cannot read
 * is told so once rather than as every scenario failing; the rules then share that read. Cucumber
 * is loaded only after it, so a target that cannot be read is told so at once.
 *
 * The target's own cucumber configuration file is not read (`file: false`): its `default` profile is
 * the suite its gates run, and a command line's paths are added to a profile's rather than
 * replacing them. So the run is described here whole: the rules file, the steps, `progress` and
 * `summary` because a break is read by name, and any extra formatter named on the command line
 * (`rules-run.ts` adds a message stream). The steps are named relative to the working directory,
 * with forward slashes, because cucumber reads its import paths as globs.
 */
const STEPS = relative(process.cwd(), fileURLToPath(new URL("../steps", import.meta.url))).replaceAll(
  "\\",
  "/",
);

try {
  await readOnce(join(process.cwd(), sep));
} catch (error) {
  if (!(error instanceof ReadFailure)) throw error;
  process.stderr.write(`insight: ${error.message}\n`);
  process.exit(2);
}

const { loadConfiguration, runCucumber } = await import("@cucumber/cucumber/api");
const { runConfiguration } = await loadConfiguration({
  file: false,
  provided: {
    paths: [RULES],
    import: [`${STEPS}/**/*.ts`],
    format: ["progress", "summary", ...process.argv.slice(2)],
    strict: true,
  },
});
const { success } = await runCucumber(runConfiguration);

process.exit(success ? 0 : 1);
