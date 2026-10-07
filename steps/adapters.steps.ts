import { posix } from "node:path";
import { type DataTable, Given, Then } from "@cucumber/cucumber";
import type { Block } from "../analysis/blocks.js";
import type { AnalysisContext } from "../analysis/context.js";
import { contractFeaturesOf } from "../analysis/contracts.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The Rule that holds an unmanaged adapter to a contract feature and a managed one to none
 * (ADR-0019, ADR-0023).
 *
 * Which adapters are managed is the operator's call, listed in the Background; every other folder
 * under `src/adapters` is unmanaged. An adapter is run by a contract feature when that feature's
 * steps construct it, which is what `contractFeaturesOf` answers for the map as well.
 */

const ADAPTERS = "src/adapters";

Given("the managed adapters are:", function (this: RulesWorld, table: DataTable) {
  const names = table.hashes().map((row) => row.adapter ?? "");
  const folders = new Set(adaptersOf(this.context).map(nameOf));
  this.managed = new Set(names);
  refuseAny(
    names
      .filter((name) => !folders.has(name))
      .map((name) => `${ADAPTERS}/${name}: is listed as managed, but is not an adapter`),
  );
});

Then(
  "each unmanaged one is run by a feature under {string}",
  function (this: RulesWorld, path: string) {
    refuseAny(
      this.groups
        .filter((adapter) => !this.managed.has(nameOf(adapter)))
        .filter((adapter) => featuresRunning(this.context, adapter, path).length === 0)
        .map((adapter) => `src/${adapter.id}: is unmanaged, and no feature under ${path} runs it`),
    );
  },
);

Then(
  "no managed one is run by a feature under {string}",
  function (this: RulesWorld, path: string) {
    refuseAny(
      this.groups
        .filter((adapter) => this.managed.has(nameOf(adapter)))
        .flatMap((adapter) =>
          featuresRunning(this.context, adapter, path).map(
            (feature) => `src/${adapter.id}: is managed, but ${feature} runs it`,
          ),
        ),
    );
  },
);

function adaptersOf(context: AnalysisContext): readonly Block[] {
  return context.blocks.filter(
    (block) => posix.dirname(context.relative(block.directory)) === ADAPTERS,
  );
}

function nameOf(block: Block): string {
  return posix.basename(block.directory);
}

/** The paths of the features under `path` whose steps construct the adapter. */
function featuresRunning(
  context: AnalysisContext,
  adapter: Block,
  path: string,
): readonly string[] {
  return contractFeaturesOf(context, adapter)
    .map((feature) => feature.path)
    .filter((feature) => feature.startsWith(`${path}/`));
}
