import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readerFor } from "../readers/read.js";

/*
 * The line between the hexagon part and the readers (`analysis/model.ts`): the hexagon part knows
 * no language, so it imports no compiler and reaches a reader only through `readers/read.ts`; and
 * that front door loads a language's reader only once it knows the target is in that language.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** What the hexagon part is: the map, the Tests view, the rule steps and the server. */
const HEXAGON = [
  ...scriptsIn("analysis").map((name) => `analysis/${name}`),
  ...scriptsIn("steps").map((name) => `steps/${name}`),
  "server.ts",
];

function scriptsIn(folder: string): readonly string[] {
  return readdirSync(join(ROOT, folder)).filter((name) => name.endsWith(".ts"));
}

/** Every module a file imports, statically or with `import()`. */
function importsOf(path: string): readonly string[] {
  const text = readFileSync(join(ROOT, path), "utf8");

  return [...text.matchAll(/(?:from\s+|import\s*\(\s*)"([^"]+)"/g)].flatMap(([, name]) =>
    name === undefined ? [] : [name],
  );
}

/** The modules a file imports with a static `import … from`, which load with it. */
function staticImportsOf(path: string): readonly string[] {
  const text = readFileSync(join(ROOT, path), "utf8");

  return [...text.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].flatMap(([, name]) =>
    name === undefined ? [] : [name],
  );
}

test("the hexagon part imports no compiler, and no reader but the front door", () => {
  const offences = HEXAGON.flatMap((path) =>
    importsOf(path)
      .filter(
        (name) =>
          name === "typescript" || (name.includes("readers/") && !name.endsWith("readers/read.js")),
      )
      .map((name) => `${path} imports ${name}`),
  );

  assert.deepEqual(offences, []);
});

test("the front door and the layout load no language's reader with them", () => {
  const offences = ["readers/read.ts", "readers/layout.ts"].flatMap((path) =>
    staticImportsOf(path)
      .filter((name) => name === "typescript" || name.startsWith("./typescript/"))
      .map((name) => `${path} imports ${name}`),
  );

  assert.deepEqual(offences, []);
});

test("a target with tsconfig.check.json is read as TypeScript", () => {
  assert.equal(readerFor(["src", "tsconfig.check.json", "package.json"]), "typescript");
});

test("a target with a solution is C#, which no reader reads yet", () => {
  assert.throws(() => readerFor(["CryptoTrader.slnx", "src"]), {
    message: "Found CryptoTrader.slnx: this is a C# target, and the C# reader is not available yet (#6)",
  });
  assert.throws(() => readerFor(["CryptoTrader.sln"]), /C# reader is not available yet/);
});

test("a target that is both, or neither, is refused, naming what was found", () => {
  assert.throws(
    () => readerFor(["tsconfig.check.json", "Tools.sln"]),
    /^Error: Found tsconfig\.check\.json, Tools\.sln: this target is both TypeScript and C#/,
  );
  assert.throws(() => readerFor(["package.json", "tsconfig.json"]), /Found neither tsconfig\.check\.json/);
});
