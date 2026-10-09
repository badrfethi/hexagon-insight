import { Given, Then } from "@cucumber/cucumber";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The Rule that every acceptance scenario comes in through an incoming port (`rules.feature`,
 * #168).
 *
 * Which door a scenario came in is measured by running it (`Model.doors`; for TypeScript,
 * `readers/typescript/doors/`), so this Given runs the acceptance suite once, each feature on its
 * own. A scenario that came in no door is one offence, named by its feature and line, which is what
 * marks that feature on Tests. A reader that measures no doors breaks the rule against the folder:
 * nothing shows its scenarios come in through a port, and an empty list would say they all do.
 */

Given("the scenarios under {string}", async function (this: RulesWorld, folder: string) {
  await this.read();
  const doors = this.context.model.doors;
  refuseAny(
    doors === undefined
      ? [
          `${folder}/: this target's reader measures no doors, so no scenario here can be shown ` +
            "to come in through an incoming port",
        ]
      : [],
  );
  this.scenarios = (await doors?.(folder)) ?? [];
});

Then("each of them came in through an incoming port", function (this: RulesWorld) {
  refuseAny(
    this.scenarios
      .filter((scenario) => scenario.door !== "incoming-port")
      .map(
        (scenario) =>
          `${scenario.path}:${String(scenario.line)}: came in through no incoming port; ` +
          "an acceptance scenario drives one",
      ),
  );
});
