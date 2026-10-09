import type { Block } from "./blocks.js";
import { type AnalysisContext, inFolder } from "./context.js";
import { contractTestsOf } from "./contracts.js";
import type { CodeFile, Declaration } from "./model.js";

/**
 * An arrow on the map (#74, decision 3).
 *
 * - `depends-on` — a constructor in `from` takes a parameter typed by something `to` exports: a
 *   group's interface or port, or a type an adapter exports, such as `RunProcess`.
 * - `implements` — a class in `from`, constructed in a composition root (`Code.compositionRoots`,
 *   `src/index.ts` in a TypeScript target), implements a port `to` owns. Constructed anywhere in
 *   that file counts, so an adapter handed to another adapter there still has its arrow.
 * - `references` — an adapter imports an interface from `to`'s `incoming_ports/`. An incoming
 *   adapter drives the hexagon through such a port rather than implementing it, and may reference
 *   several, in staff or in suppliers. It replaces a `depends-on` arrow between the same two blocks.
 * - `checked-by` — an adapter is stood in front of its real supplier by a contract test in
 *   `tests/contracts/` (ADR-0019), a feature or a plain test. The test belongs to the adapter it
 *   constructs (`contracts.ts`), so `tests/contracts/anthropic.feature` draws two of these, one to
 *   each Claude adapter. It is the only arrow that ends outside `src/`.
 * - `uses` — a block, or a file of the core, uses a file of the core (`usedFiles`): nearly
 *   everything does, so it is the core's own kind, and the page draws only the clicked block's. A
 *   file of the core that uses the target's code outside `src/core` draws one too, to the block that
 *   code is in, and breaks the rule that the core stands on nothing (`rules.feature`, Rule 6).
 *
 * Raw imports are otherwise not arrows.
 */
export interface Arrow {
  readonly from: string;
  readonly to: string;
  readonly kind: "depends-on" | "implements" | "references" | "checked-by" | "uses";
}

export function arrowsOf(context: AnalysisContext): Arrow[] {
  const references = context.blocks
    .filter((block) => block.column === "adapters")
    .flatMap((block) =>
      incomingPortGroupsOf(context, block).map((target) => ({
        from: block.id,
        to: target.id,
        kind: "references" as const,
      })),
    );
  const referenced = new Set(references.map((arrow) => `${arrow.from} ${arrow.to}`));
  const dependencies = dependenciesOf(context).filter(
    (arrow) => !referenced.has(`${arrow.from} ${arrow.to}`),
  );

  return unique([
    ...references,
    ...dependencies,
    ...implementations(context),
    ...checks(context),
    ...uses(context),
  ]);
}

/**
 * The target's own files a file uses, each once, in the order first named: those it imports, and
 * those declaring what it imports, takes in a constructor or constructs. Not the file itself.
 */
export function usedFiles(context: AnalysisContext, file: CodeFile): readonly string[] {
  const declared = [...file.imports, ...file.constructorParameterTypes, ...file.constructs].map(
    (id) => context.declaration(id).file,
  );

  return [...new Set([...file.importedFiles, ...declared])].filter((path) => path !== file.path);
}

/** Each block and file of the core to each file of the core it uses, and the core's to what else it uses. */
function uses(context: AnalysisContext): Arrow[] {
  const coreAt = new Map(context.core.map((block) => [block.directory, block] as const));
  const toCore = context.blocks.flatMap((block) =>
    context
      .filesOf(block)
      .flatMap((file) => usedFiles(context, file))
      .flatMap((path) => coreAt.get(path) ?? [])
      .map((target) => ({ from: block.id, to: target.id, kind: "uses" as const })),
  );
  const fromCore = context.core.flatMap((block) => {
    const file = context.fileAt(block.directory);

    return (file === undefined ? [] : usedFiles(context, file))
      .flatMap((path) => coreAt.get(path) ?? context.blockOf(path) ?? [])
      .filter((target) => isOther(target, block))
      .map((target) => ({ from: block.id, to: target.id, kind: "uses" as const }));
  });

  return [...toCore, ...fromCore];
}

/** Each block to the contract tests that check it — the outgoing adapters, in practice. */
function checks(context: AnalysisContext): Arrow[] {
  return context.blocks.flatMap((block) =>
    contractTestsOf(context, block).map((test) => ({
      from: block.id,
      to: test,
      kind: "checked-by" as const,
    })),
  );
}

/**
 * The other blocks whose `incoming_ports/` a block imports an interface from, which is what makes
 * an adapter incoming on the map.
 */
export function incomingPortGroupsOf(context: AnalysisContext, block: Block): Block[] {
  const targets = context
    .filesOf(block)
    .flatMap((file) => file.imports)
    .map((id) => context.declaration(id))
    .filter(isIncomingPort)
    .flatMap((declaration) => context.blockOf(declaration.file) ?? [])
    .filter((target) => target !== block);

  return [...new Set(targets)];
}

function isIncomingPort(declaration: Declaration): boolean {
  return declaration.kind === "interface" && inFolder(declaration.file, "incoming_ports");
}

function dependenciesOf(context: AnalysisContext): Arrow[] {
  return context.blocks.flatMap((block) =>
    context
      .filesOf(block)
      .flatMap((file) => file.constructorParameterTypes)
      .map((id) => blockExporting(context, id))
      .filter((target) => isOther(target, block))
      .map((target) => ({ from: block.id, to: target.id, kind: "depends-on" as const })),
  );
}

/** The block that exports a declaration: declared in the block, with `export` on it. */
function blockExporting(context: AnalysisContext, id: string): Block | undefined {
  const declaration = context.declaration(id);

  return declaration.exported ? context.blockOf(declaration.file) : undefined;
}

function implementations(context: AnalysisContext): Arrow[] {
  return context.model.compositionRoots
    .flatMap((path) => context.fileAt(path) ?? [])
    .flatMap((root) => root.constructs)
    .map((id) => context.declaration(id))
    .flatMap((declaration) => portsOf(context, declaration));
}

function portsOf(context: AnalysisContext, declaration: Declaration): Arrow[] {
  const block = context.blockOf(declaration.file);

  return block === undefined ? [] : implemented(context, declaration, block);
}

function implemented(context: AnalysisContext, declaration: Declaration, block: Block): Arrow[] {
  return declaration.implements
    .flatMap(({ target }) => (target === undefined ? [] : [context.declaration(target)]))
    .map((port) => context.blockOf(port.file))
    .filter((target) => isOther(target, block))
    .map((target) => ({ from: block.id, to: target.id, kind: "implements" as const }));
}

function isOther(target: Block | undefined, block: Block): target is Block {
  return target !== undefined && target !== block;
}

function unique(arrows: Arrow[]): Arrow[] {
  const seen = new Map(arrows.map((arrow) => [`${arrow.kind} ${arrow.from} ${arrow.to}`, arrow]));

  return [...seen.values()];
}
