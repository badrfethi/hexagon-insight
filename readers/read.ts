import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Model } from "../analysis/model.js";
import { layoutOf } from "./layout.js";

/**
 * Reads a target into the model the hexagon part draws and checks (`analysis/model.ts`). It is the
 * only part of `readers/` the hexagon part imports.
 *
 * The reader is told by the files at the target's root (`readerFor`), and reached only by a
 * dynamic `import()`, so a target in another language never loads a TypeScript compiler.
 *
 * `INSIGHT_MODEL` names a model already written down, as JSON, and reads that instead of the
 * target: the hexagon part's tests run on such a model, which measures no doors. A relative path is
 * taken from the working directory.
 */
export async function readModel(root: string): Promise<Model> {
  const written = process.env.INSIGHT_MODEL;

  if (written !== undefined && written !== "") {
    return JSON.parse(readFileSync(resolve(written), "utf8")) as Model;
  }

  const normalRoot = normal(root);
  readerFor(readdirSync(normalRoot));
  const { readTypeScript } = await import("./typescript/read.js");

  return { ...layoutOf(normalRoot), ...readTypeScript(normalRoot) };
}

/** The readers there are, by the folder under `readers/` each is in. */
export type Reader = "typescript";

/**
 * Which reader a target needs, from the names at its root: `tsconfig.check.json` is a TypeScript
 * target, and a `*.sln` or `*.slnx` a C# one. One that is both, or neither, is refused, naming what
 * was found: guessing would draw half a target as if it were all of it.
 */
export function readerFor(names: readonly string[]): Reader {
  const typescript = names.filter((name) => name === "tsconfig.check.json");
  const csharp = names.filter((name) => /\.slnx?$/.test(name));

  if (typescript.length > 0 && csharp.length > 0) {
    throw new Error(
      `Found ${[...typescript, ...csharp].join(", ")}: this target is both TypeScript and C#, and ` +
        "insight reads one language per target",
    );
  }

  if (csharp.length > 0) {
    throw new Error(
      `Found ${csharp.join(", ")}: this is a C# target, and the C# reader is not available yet (#6)`,
    );
  }

  if (typescript.length === 0) {
    throw new Error(
      "Found neither tsconfig.check.json (TypeScript) nor a *.sln or *.slnx (C#) at the root: " +
        "insight cannot tell which language this target is written in",
    );
  }

  return "typescript";
}

function normal(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}
