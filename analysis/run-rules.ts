import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfiguration, runCucumber } from "@cucumber/cucumber/api";
import { RULES } from "./rules.js";

/**
 * `hexagon-insight rules`: runs this package's rules (`rules.ts`) with its steps, over the
 * repository it is started in, and exits non-zero when a rule breaks.
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
