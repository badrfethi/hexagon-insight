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
 * A target that cannot be read into a model at all fails with a `ReadFailure`, which names why.
 *
 * `INSIGHT_MODEL` names a model already written down, as JSON, and reads that instead of the
 * target: the hexagon part's tests run on such a model, which measures no doors. A relative path is
 * taken from the target's root.
 */
export async function readModel(root: string): Promise<Model> {
  const normalRoot = normal(root);
  const written = process.env.INSIGHT_MODEL;

  if (written !== undefined && written !== "") {
    return JSON.parse(readFileSync(resolve(normalRoot, written), "utf8")) as Model;
  }

  readerFor(readdirSync(normalRoot));
  const { readTypeScript } = await import("./typescript/read.js");

  return { ...layoutOf(normalRoot), ...readTypeScript(normalRoot) };
}

/**
 * The model of the target this process runs in, read once for the process: `hexagon-insight rules`
 * reads it before the rules start, to tell a read failure from a break, and every rule's `Given`
 * then shares that read (`steps/world.ts`). The server does not use it: each page load reads afresh.
 */
export function readOnce(root: string): Promise<Model> {
  once ??= readModel(root);

  return once;
}

let once: Promise<Model> | undefined;

/**
 * A target the tool cannot read into a model: no language it can tell, or code its reader cannot
 * load. It is not a break, which is a design flaw in a target that was read: nothing can be drawn
 * or checked, so `hexagon-insight rules` exits 2 and the page shows the message in place of the map.
 */
export class ReadFailure extends Error {
  override readonly name = "ReadFailure";
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
    throw new ReadFailure(
      `Found ${[...typescript, ...csharp].join(", ")}: this target is both TypeScript and C#, and ` +
        "insight reads one language per target",
    );
  }

  if (csharp.length > 0) {
    throw new ReadFailure(
      `Found ${csharp.join(", ")}: this is a C# target, and the C# reader is not available yet (#6)`,
    );
  }

  if (typescript.length === 0) {
    throw new ReadFailure(
      "Found neither tsconfig.check.json (TypeScript) nor a *.sln or *.slnx (C#) at the root: " +
        "insight cannot tell which language this target is written in",
    );
  }

  return "typescript";
}

function normal(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}
