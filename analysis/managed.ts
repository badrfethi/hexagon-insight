import { readFileSync } from "node:fs";
import { posix } from "node:path";
import type { AnalysisContext } from "./context.js";
import { type GherkinDocument, parseFeature } from "./contracts.js";
import { RULES } from "./rules-file.js";

type Child = NonNullable<GherkinDocument["feature"]>["children"][number];
type Rule = NonNullable<Child["rule"]>;
type Step = NonNullable<Rule["children"][number]["background"]>["steps"][number];

export const MANAGED_RULE =
  "An unmanaged adapter has a contract feature, and a managed one has none";

/**
 * The adapters the operator calls managed (ADR-0023), read from the data table in the Background of
 * the rule named `MANAGED_RULE` in the target's rules (`rules-file.ts`). That table is the only list: the map badges
 * each adapter from it, and every adapter not in it is unmanaged. A rule or table that cannot be
 * found reads as no managed adapters, which the rule's own scenarios would then show as breaks.
 */
export function managedAdapters(context: AnalysisContext): ReadonlySet<string> {
  return context.memo("managed", () => new Set(namesIn(context.root)));
}

function namesIn(root: string): readonly string[] {
  const document = parseFeature(readFileSync(posix.join(root, RULES), "utf8"));

  return backgroundStepsOf(document)
    .flatMap((step) => (step.dataTable?.rows ?? []).slice(1))
    .map(firstCell);
}

function backgroundStepsOf(document: GherkinDocument): readonly Step[] {
  const children = ruleNamed(document)?.children ?? [];

  return children.flatMap((child) => child.background?.steps ?? []);
}

function ruleNamed(document: GherkinDocument): Rule | undefined {
  const children = document.feature?.children ?? [];

  return children.find((child) => child.rule?.name === MANAGED_RULE)?.rule;
}

function firstCell(row: { readonly cells: readonly { readonly value: string }[] }): string {
  return row.cells[0]?.value ?? "";
}
