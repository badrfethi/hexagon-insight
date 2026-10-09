import { posix } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import type { Block } from "../analysis/blocks.js";
import type { AnalysisContext } from "../analysis/context.js";
import { testsRunning } from "../analysis/contracts.js";
import { type Lane, lanesOf } from "../analysis/map.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The Rule that pairs each adapter with the kind of test its lane calls for: an outgoing adapter
 * with a contract test, an incoming one with an entry point test, and neither with the other unless
 * it is in both lanes.
 *
 * The lanes are the map's (`lanesOf`): an adapter is incoming when it references an incoming port,
 * outgoing when it implements an outgoing port or references none, and both when both hold. An
 * adapter is run by a test when that test, a feature or a plain test, constructs it, which is what
 * `testsRunning` answers for the map as well. A folder the target does not have runs nothing, so an
 * adapter whose lane calls for it breaks.
 */

const LANES: Readonly<Record<string, Lane>> = {
  incoming: "incoming-adapters",
  outgoing: "outgoing-adapters",
};

Given(
  "the {word} adapters under {string}",
  async function (this: RulesWorld, direction: string, path: string) {
    await this.read();
    const lane = laneNamed(direction, path);
    this.direction = direction;
    this.groups = adaptersUnder(this.context, path).filter((adapter) =>
      lanesOf(this.context, adapter).includes(lane),
    );
  },
);

Given(
  "the adapters under {string} that are only {word}",
  async function (this: RulesWorld, path: string, direction: string) {
    await this.read();
    const lane = laneNamed(direction, path);
    this.direction = direction;
    this.groups = adaptersUnder(this.context, path).filter((adapter) => {
      const lanes = lanesOf(this.context, adapter);

      return lanes.length === 1 && lanes[0] === lane;
    });
  },
);

Then("each of them is run by a test under {string}", function (this: RulesWorld, path: string) {
  refuseAny(
    this.groups
      .filter((adapter) => testsOf(this.context, adapter, path).length === 0)
      .map(
        (adapter) =>
          `src/${adapter.id}: is an ${this.direction} adapter, and no test under ${path} runs it`,
      ),
  );
});

Then("none of them is run by a test under {string}", function (this: RulesWorld, path: string) {
  refuseAny(
    this.groups.flatMap((adapter) =>
      testsOf(this.context, adapter, path).map(
        (test) => `src/${adapter.id}: is an ${this.direction} adapter, but ${test} runs it`,
      ),
    ),
  );
});

/** The lane a word names, refusing any other word: it would select no lane, and every Then would pass. */
function laneNamed(direction: string, path: string): Lane {
  const lane = Object.hasOwn(LANES, direction) ? LANES[direction] : undefined;

  if (lane === undefined) {
    refuseAny([`${path}: "${direction}" is not incoming or outgoing`]);
  }

  return lane as Lane;
}

/** The adapters directly under a path, refusing a path with none, so a moved folder cannot pass vacuously. */
function adaptersUnder(context: AnalysisContext, path: string): readonly Block[] {
  const under = context.blocks.filter((block) => posix.dirname(block.directory) === path);
  refuseAny(under.length === 0 ? [`${path}: holds no adapters`] : []);

  return under;
}

/** The paths of the tests under `path` that construct the adapter. */
function testsOf(context: AnalysisContext, adapter: Block, path: string): readonly string[] {
  return testsRunning(context, adapter, path);
}
