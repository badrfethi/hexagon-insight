import { execFileSync } from "node:child_process";

/**
 * What counts as code, and so as something the map must account for: the languages a TypeScript
 * repository is written in. Markdown, workflows, JSON and lockfiles are documentation and
 * configuration data, not code with a shape worth drawing.
 */
const CODE = /\.(?:ts|mts|cts|js|mjs|cjs|html|feature)$/;

/**
 * Every code file git knows about, relative to the root. `--others --exclude-standard` adds files
 * that are not committed yet, so a file written a minute ago is on the map, while everything git
 * ignores — `node_modules/`, `dist/`, a run's media — stays off it.
 */
export function codeFiles(root: string): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  return [...new Set(listed.split("\n").map((line) => line.trim()))]
    .filter((path) => CODE.test(path))
    .sort();
}
