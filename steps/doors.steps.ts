import { Given, Then } from "@cucumber/cucumber";
import { scenarioDoors } from "../analysis/feature-runs.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The Rule that every acceptance scenario comes in through an incoming port (ADR-0031, amended by
 * ADR-0032; #168).
 *
 * Which door a scenario came in is measured by running it (`feature-runs.ts`, `doors.ts`), so this
 * Given runs the acceptance suite once, each feature on its own. A scenario that came in no door is
 * one offence, named by its feature and line, which is what marks that feature on Tests.
 */

Given("the scenarios under {string}", async function (this: RulesWorld, folder: string) {
  this.scenarios = await scenarioDoors(this.context, folder);
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
