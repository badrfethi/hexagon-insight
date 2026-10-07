import { relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The rules, which are this package's: `rules.feature` at its root, run with the steps in `steps/`.
 * A target provides code and tests in the fixed layout and no rules, so a `rules.feature` at the
 * target's root is not read.
 *
 * Named relative to the working directory, which is the target, with forward slashes: cucumber
 * reads its paths as globs, and a break names it as the file it is against.
 */
export const RULES = relative(
  process.cwd(),
  fileURLToPath(new URL("../rules.feature", import.meta.url)),
).replaceAll("\\", "/");

/**
 * The Rule that pairs each adapter with the kind of test its lane calls for. Its breaks name the
 * adapters, and they are about the tests, so they show on Tests (`breaks.ts`).
 */
export const ADAPTER_RULE =
  "An outgoing adapter has a contract test, and an incoming adapter has an entry point test";
