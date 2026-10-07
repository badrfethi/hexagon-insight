/**
 * The target repository's rules, relative to its root: `rules.feature` at the root, unless
 * `INSIGHT_RULES` names another file. The file is the operator's and per repository; this package
 * brings only the steps it runs with (`steps/`).
 */
export const RULES = process.env.INSIGHT_RULES ?? "rules.feature";
