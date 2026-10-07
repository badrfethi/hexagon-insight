import { posix } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import type { Block } from "../analysis/blocks.js";
import type { AnalysisContext } from "../analysis/context.js";
import { featuresRunning } from "../analysis/contracts.js";
import { type Lane, laneOf } from "../analysis/map.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The Rule that pairs each adapter with the kind of test its lane calls for: an outgoing adapter
 * with a contract test, an incoming one with an entry point test, and neither with the other.
 *
 * The lane is the map's (`laneOf`): an adapter is incoming when it references an incoming port, and
 * outgoing otherwise. An adapter is run by a feature when that feature's steps construct it, which
 * is what `featuresRunning` answers for the map as well. A folder the target does not have runs
 * nothing, so an adapter whose lane calls for it breaks.
 */

const LANES: Readonly<Record<string, Lane>> = {
  incoming: "incoming-adapters",
  outgoing: "outgoing-adapters",
};

Given(
  "the {word} adapters under {string}",
  function (this: RulesWorld, direction: string, path: string) {
    this.direction = direction;
    this.groups = adaptersUnder(this.context, path).filter(
      (adapter) => laneOf(this.context, adapter) === LANES[direction],
    );
  },
);

Then("each of them is run by a feature under {string}", function (this: RulesWorld, path: string) {
  refuseAny(
    this.groups
      .filter((adapter) => featuresOf(this.context, adapter, path).length === 0)
      .map(
        (adapter) =>
          `src/${adapter.id}: is an ${this.direction} adapter, and no feature under ${path} runs it`,
      ),
  );
});

Then("none of them is run by a feature under {string}", function (this: RulesWorld, path: string) {
  refuseAny(
    this.groups.flatMap((adapter) =>
      featuresOf(this.context, adapter, path).map(
        (feature) => `src/${adapter.id}: is an ${this.direction} adapter, but ${feature} runs it`,
      ),
    ),
  );
});

/** The adapters directly under a path, refusing a path with none, so a moved folder cannot pass vacuously. */
function adaptersUnder(context: AnalysisContext, path: string): readonly Block[] {
  const under = context.blocks.filter(
    (block) => posix.dirname(context.relative(block.directory)) === path,
  );
  refuseAny(under.length === 0 ? [`${path}: holds no adapters`] : []);

  return under;
}

/** The paths of the features under `path` whose steps construct the adapter. */
function featuresOf(context: AnalysisContext, adapter: Block, path: string): readonly string[] {
  return featuresRunning(context, adapter, path).map((feature) => feature.path);
}
