import { existsSync } from "node:fs";
import { posix } from "node:path";

/**
 * One kind of test, the folder at the target's root its tests live in, and why it has none.
 *
 * The four kinds and their folders are the tool's, not the target's (#8): a test goes to its kind by
 * what it fakes, and to that kind's folder. The Tests view draws a lane per kind (#166), and a
 * target holds its tests in these folders and nowhere else.
 *
 * - **Entry point test**, `entry-points/`: an incoming adapter's outer surface, with the incoming
 *   port faked.
 * - **Acceptance test**, `features/`: an incoming port driven with a Test Double at each outgoing
 *   port.
 * - **Core test**, `core-tests/`: one piece of core logic, faking nothing.
 * - **Contract test**, `contracts/`: what an adapter and its Test Double assume about the real
 *   supplier, faking nothing.
 *
 * `features/` is required of a target; the other three are optional, and a missing one means that
 * kind has no tests, not that the target is wrong.
 */
export interface TestKind {
  /** Such as `Acceptance test`. */
  readonly kind: string;
  /** The folder its tests live in, relative to the root and without a slash. */
  readonly folder: string;
  /** Why it has no tests, such as "No `entry-points/` folder."; `null` when its folder is there. */
  readonly reason: string | null;
}

/**
 * The kinds in the order the Tests view reads, outside in: what a Client meets, the hexagon through
 * its incoming port, its core, and the suppliers at the far side (#165, decision 4).
 */
const KINDS: readonly Pick<TestKind, "kind" | "folder">[] = [
  { kind: "Entry point test", folder: "entry-points" },
  { kind: "Acceptance test", folder: "features" },
  { kind: "Core test", folder: "core-tests" },
  { kind: "Contract test", folder: "contracts" },
];

export function testKinds(root: string): readonly TestKind[] {
  return KINDS.map(({ kind, folder }) => ({
    kind,
    folder,
    reason: existsSync(posix.join(root, folder)) ? null : `No \`${folder}/\` folder.`,
  }));
}

/** Up to the first full stop that ends a sentence: one followed by a capital, or by nothing. */
export function firstSentence(text: string): string {
  return (
    /^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/.exec(text.trim())?.[0].replace(/\s+/g, " ") ?? text.trim()
  );
}
