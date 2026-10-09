import { Given, Then } from "@cucumber/cucumber";
import { usedFiles } from "../analysis/arrows.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The rule that the core stands on nothing (`rules.feature`, Rule 6): no file under `src/core` uses
 * the target's code outside it. "Uses" is what draws a `uses` arrow on the map (`usedFiles` in
 * `analysis/arrows.ts`): a file it imports, or one declaring what it imports, takes in a
 * constructor or constructs. A package is not the target's code, so it is not counted.
 *
 * A target need not have a core, so the `Given` does not refuse an empty list, as the layout
 * rule's do not (`layout.steps.ts`): with no core there is nothing to break the rule.
 */

Given("the files under {string}", async function (this: RulesWorld, path: string) {
  await this.read();
  this.files = this.context.compiled.filter((file) => file.path.startsWith(`${path}/`));
});

Then(
  "none of them uses the target's code outside {string}",
  function (this: RulesWorld, path: string) {
    refuseAny(
      this.files.flatMap((file) =>
        usedFiles(this.context, file)
          .filter((used) => !used.startsWith(`${path}/`))
          .map((used) => `${file.path}: uses ${used}, outside ${path}/`),
      ),
    );
  },
);
