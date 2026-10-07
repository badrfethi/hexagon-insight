import { existsSync } from "node:fs";
import { posix } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import ts from "typescript";
import type { Block } from "../analysis/blocks.js";
import type { AnalysisContext } from "../analysis/context.js";
import { declarationOf, isExported, lineAt } from "../analysis/symbols.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * Rules about groups: that a staff group has a contract its own services implement, and that a
 * supplier group has outgoing ports that an adapter implements (ADR-0011).
 *
 * A group's contract is the interfaces exported from the named folders. "Implemented" is read from
 * `implements` clauses: a class declared in the named place whose clause names the interface.
 */

Given("the groups under {string}", function (this: RulesWorld, path: string) {
  this.groups = groupsUnder(this.context, path);
});

Given("the adapters under {string}", function (this: RulesWorld, path: string) {
  this.groups = groupsUnder(this.context, path);
});

Then(
  "each of them has an interface in {string} or {string}",
  function (this: RulesWorld, one: string, other: string) {
    refuseAny(
      this.groups
        .filter((group) => foldersWithContracts(this.context, group, [one, other]) === 0)
        .map(
          (group) =>
            `${this.context.relative(group.directory)}: has no interface in ${one}/ or ${other}/`,
        ),
    );
  },
);

Then(
  "each of them has an interface in {string}, and no {string} folder",
  function (this: RulesWorld, ports: string, forbidden: string) {
    refuseAny([
      ...this.groups
        .filter((group) => contractsOf(this.context, group, [ports]).length === 0)
        .map((group) => `${this.context.relative(group.directory)}: has no interface in ${ports}/`),
      ...this.groups
        .filter((group) => existsSync(posix.join(group.directory, forbidden)))
        .map((group) => `${this.context.relative(group.directory)}/${forbidden}: is here`),
    ]);
  },
);

Then(
  "each interface in their {string} and {string} folders is implemented by a class in their {string} folder",
  function (this: RulesWorld, one: string, other: string, services: string) {
    refuseAny(
      this.groups.flatMap((group) =>
        unimplemented(
          contractsOf(this.context, group, [one, other]),
          implementedBy(this.context, filesIn(this.context, group, services)),
        ).map(
          (port) =>
            `${where(this.context, port)}: ${port.name.text} is implemented by no class in ${this.context.relative(group.directory)}/${services}`,
        ),
      ),
    );
  },
);

Then(
  "each interface in their {string} folders is implemented by a class under {string}",
  function (this: RulesWorld, folder: string, path: string) {
    refuseAny(
      unimplemented(
        this.groups.flatMap((group) => contractsOf(this.context, group, [folder])),
        implementedBy(this.context, filesUnder(this.context, path)),
      ).map(
        (port) =>
          `${where(this.context, port)}: ${port.name.text} is implemented by no class under ${path}`,
      ),
    );
  },
);

/** The groups directly under a path, refusing a path with none, so a moved folder cannot pass vacuously. */
function groupsUnder(context: AnalysisContext, path: string): readonly Block[] {
  const under = context.blocks.filter(
    (block) => posix.dirname(context.relative(block.directory)) === path,
  );
  refuseAny(under.length === 0 ? [`${path}: holds no groups`] : []);

  return under;
}

/** How many of `folders` hold at least one of the group's contracts. */
function foldersWithContracts(
  context: AnalysisContext,
  group: Block,
  folders: readonly string[],
): number {
  return folders.filter((folder) => contractsOf(context, group, [folder]).length > 0).length;
}

/** The interfaces exported from a group's folders. */
function contractsOf(
  context: AnalysisContext,
  group: Block,
  folders: readonly string[],
): readonly ts.InterfaceDeclaration[] {
  return folders
    .flatMap((folder) => filesIn(context, group, folder))
    .flatMap((file) => file.statements.filter(ts.isInterfaceDeclaration))
    .filter(isExported);
}

function filesIn(context: AnalysisContext, group: Block, folder: string): readonly ts.SourceFile[] {
  const prefix = `${group.directory}/${folder}/`;

  return context.filesOf(group).filter((file) => file.fileName.startsWith(prefix));
}

function filesUnder(context: AnalysisContext, path: string): readonly ts.SourceFile[] {
  const prefix = `${path}/`;

  return context.sourceFiles.filter((file) => context.relative(file.fileName).startsWith(prefix));
}

/** Every declaration named in the `implements` clause of a class declared in `files`. */
function implementedBy(
  context: AnalysisContext,
  files: readonly ts.SourceFile[],
): ReadonlySet<ts.Declaration> {
  return new Set(
    files
      .flatMap((file) => file.statements.filter(ts.isClassDeclaration))
      .flatMap((declaration) => declaration.heritageClauses ?? [])
      .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
      .flatMap((clause) => clause.types)
      .flatMap((type) => declarationOf(context, type.expression) ?? []),
  );
}

/** The ports no class in `attached` implements. */
function unimplemented(
  ports: readonly ts.InterfaceDeclaration[],
  attached: ReadonlySet<ts.Declaration>,
): readonly ts.InterfaceDeclaration[] {
  return ports.filter((port) => !attached.has(port));
}

function where(context: AnalysisContext, node: ts.Node): string {
  const file = node.getSourceFile();

  return `${context.relative(file.fileName)}:${String(lineAt(file, node.getStart()))}`;
}
