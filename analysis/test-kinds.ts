import { posix } from "node:path";
import type { Layout } from "./model.js";

/**
 * One kind of test, the folder its tests live in, and why it has none.
 *
 * The four kinds and their folders are the tool's, not the target's (#8): a test goes to its kind by
 * what it fakes, and to that kind's folder. The Tests view draws a lane per kind (#166), and a
 * target holds its tests in these folders and nowhere else. Acceptance tests are Gherkin, so they
 * keep `features/` at the root, with their code in `features/support/`; the other three are code
 * first, and share `tests/` (operator decision, 2026-10-09).
 *
 * - **Entry point test**, `tests/entry-points/`: an incoming adapter's outer surface, with the
 *   incoming port faked.
 * - **Acceptance test**, `features/`: an incoming port driven with a Test Double at each outgoing
 *   port.
 * - **Core test**, `tests/core/`: one piece of core logic, faking nothing.
 * - **Contract test**, `tests/contracts/`: what an adapter and its Test Double assume about the real
 *   supplier, faking nothing.
 *
 * An entry point or contract test is a feature or a plain test, and it is the test of each adapter
 * it constructs (`contracts.ts`). `features/` is required of a target; the other three are
 * optional, and a missing one means that kind has no tests, not that the target is wrong.
 */
export interface TestKind {
  /** Such as `Acceptance test`. */
  readonly kind: string;
  /** The folder its tests live in, relative to the root and without a slash, such as `tests/core`. */
  readonly folder: string;
  /** Why it has no tests, such as "No `tests/core/` folder."; `null` when its folder is there. */
  readonly reason: string | null;
}

/**
 * The kinds in the order the Tests view reads, outside in: what a Client meets, the hexagon through
 * its incoming port, its core, and the suppliers at the far side (#165, decision 4).
 */
export const KINDS: readonly Pick<TestKind, "kind" | "folder">[] = [
  { kind: "Entry point test", folder: "tests/entry-points" },
  { kind: "Acceptance test", folder: "features" },
  { kind: "Core test", folder: "tests/core" },
  { kind: "Contract test", folder: "tests/contracts" },
];

/** The contract tests' folder, which the `checked-by` arrows end in (`arrows.ts`). */
export const CONTRACTS = "tests/contracts";

/** Each kind, and whether the target has its folder (`Layout.rootEntries`, `Layout.folders`). */
export function testKinds(layout: Pick<Layout, "rootEntries" | "folders">): readonly TestKind[] {
  return KINDS.map(({ kind, folder }) => ({
    kind,
    folder,
    reason: hasFolder(layout, folder) ? null : `No \`${folder}/\` folder.`,
  }));
}

/** A folder at the root is there when the root names it; one deeper, when its parent's listing does. */
function hasFolder(layout: Pick<Layout, "rootEntries" | "folders">, folder: string): boolean {
  const parent = posix.dirname(folder);
  const listing = layout.folders.find(({ path }) => path === parent)?.folders ?? [];

  return parent === "."
    ? layout.rootEntries.includes(folder)
    : listing.includes(posix.basename(folder));
}

/** Up to the first full stop that ends a sentence: one followed by a capital, or by nothing. */
export function firstSentence(text: string): string {
  return (
    /^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/.exec(text.trim())?.[0].replace(/\s+/g, " ") ?? text.trim()
  );
}
