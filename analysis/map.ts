import { type Arrow, arrowsOf, incomingPortGroupsOf } from "./arrows.js";
import type { Block, Column } from "./blocks.js";
import { type Break, breaksOf } from "./breaks.js";
import { type AnalysisContext, inFolder } from "./context.js";
import type { CodeFile } from "./model.js";
import type { OutsideBlock } from "./outside.js";

/** The map itself, computed from the working tree for one load, and drawn as soon as it answers. */
export interface InsightMap {
  /**
   * Left to right, and only those that hold a block. The core, when the target has a `src/core`, is
   * a column of its one block between staff and suppliers (`coreOf`), so a map without one is the
   * map it was before the core was drawn.
   */
  readonly columns: readonly MapColumn[];
  /** The row under the columns: the code that belongs to no group and is not a test (`outside.ts`). */
  readonly strip: readonly BlockView[];
  /** Drawn only for a clicked block. */
  readonly arrows: readonly Arrow[];
  /**
   * Every break, each saying which view it belongs on (`breaks.ts`): the map lists those about the
   * hexagon's structure, and Tests the rest.
   */
  readonly breaks: readonly Break[];
}

/**
 * The four columns, left to right: what drives the hexagon, the hexagon, and what it drives. The
 * map draws the hexagon only; the tests, which drive it and check its adapters, are on Tests.
 *
 * A supplier group is always outgoing — work done outside is asked for from inside, and what drives
 * the hexagon is an incoming port, which belongs to staff — so there is no incoming supplier lane.
 * An adapter is incoming when it references an interface in a group's `incoming_ports/`, which is
 * how it drives the hexagon (`arrows.ts`); every other adapter is outgoing, including one that
 * implements no port but serves outgoing adapters, such as `process-runner`. An adapter that is
 * incoming and implements an outgoing port as well is in both lanes (`lanesOf`).
 */
export type Lane =
  | "incoming-adapters"
  | "staff"
  | "suppliers"
  | "outgoing-adapters"
  | "core"
  | "outside";

export interface MapColumn {
  readonly lane: Lane;
  readonly title: string;
  readonly blocks: readonly BlockView[];
}

export interface BlockView {
  readonly id: string;
  readonly name: string;
  readonly column: Column;
  /** Non-blank, non-comment lines across the block's files. The block's area is drawn from it. */
  readonly linesOfCode: number;
  /**
   * What the block depends on outside this repository — such as npm packages and `node:` modules,
   * sorted (`CodeFile.externals`).
   *
   * It is here because the arrows only show what a block leans on **inside** the hexagon, so ten
   * packages behind a block read as no weight at all. This is the rest of what it leans on.
   */
  readonly externals: readonly string[];
}

/**
 * The columns, which are cut out of `context.blocks` and the core. The core sits between staff and
 * suppliers: the staff stand on it, and it stands on nothing, so nothing is drawn beyond it but the
 * suppliers' ports and what implements them.
 */
const LANES: readonly { readonly lane: Lane; readonly title: string }[] = [
  { lane: "incoming-adapters", title: "Incoming adapters" },
  { lane: "staff", title: "Staff" },
  { lane: "core", title: "Core" },
  { lane: "suppliers", title: "Suppliers" },
  { lane: "outgoing-adapters", title: "Outgoing adapters" },
];

/**
 * One load of the map, of the target at `root`. It runs no feature: only the rules, which its
 * breaks come from.
 */
export async function mapOf(context: AnalysisContext, root: string): Promise<InsightMap> {
  const breaks = await breaksOf(context, root);

  return {
    columns: columnsOf(context),
    strip: context.outside.map((block) => outsideViewOf(context, block)),
    arrows: arrowsOf(context),
    breaks,
  };
}

function columnsOf(context: AnalysisContext): readonly MapColumn[] {
  const lanes = new Map(context.blocks.map((block) => [block, lanesOf(context, block)] as const));

  const core = context.core === undefined ? [] : [coreViewOf(context, context.core)];

  return LANES.map(({ lane, title }) => ({
    lane,
    title,
    blocks:
      lane === "core"
        ? core
        : context.blocks
            .filter((block) => lanes.get(block)?.includes(lane) === true)
            .map((block) => viewOf(context, block)),
  })).filter((column) => column.blocks.length > 0);
}

const LANES_OF: Readonly<
  Record<Column, (context: AnalysisContext, block: Block) => readonly Lane[]>
> = {
  staff: () => ["staff"],
  suppliers: () => ["suppliers"],
  adapters: adapterLanes,
  core: () => ["core"],
  outside: () => ["outside"],
};

/**
 * The lanes a block is drawn in: one, except for an adapter with two sides (`rules.feature`,
 * Rule 3). An adapter is incoming when it references an incoming port, and outgoing when a class
 * of it implements an outgoing port, or when it references no incoming port, so an adapter that
 * serves other outgoing adapters is outgoing. One that drives an incoming port and implements an
 * outgoing one, such as a queue the hexagon writes to and a consumer reads from, is both, and is
 * drawn in both lanes under the same id.
 */
export function lanesOf(context: AnalysisContext, block: Block): readonly Lane[] {
  return LANES_OF[block.column](context, block);
}

function adapterLanes(context: AnalysisContext, block: Block): readonly Lane[] {
  const incoming = incomingPortGroupsOf(context, block).length > 0;
  const outgoing = !incoming || implementsOutgoingPort(context, block);

  return [
    ...(incoming ? (["incoming-adapters"] as const) : []),
    ...(outgoing ? (["outgoing-adapters"] as const) : []),
  ];
}

function implementsOutgoingPort(context: AnalysisContext, block: Block): boolean {
  return context
    .filesOf(block)
    .flatMap((file) => file.declares)
    .flatMap((id) => context.declaration(id).implements)
    .some(
      ({ target }) =>
        target !== undefined && inFolder(context.declaration(target).file, "outgoing_ports"),
    );
}

function viewOf(context: AnalysisContext, block: Block): BlockView {
  return sized(block, context.filesOf(block));
}

/** The core is in no group, so its files are those under its folder, read directly. */
function coreViewOf(context: AnalysisContext, core: Block): BlockView {
  return sized(
    core,
    context.compiled.filter((file) => file.path.startsWith(`${core.directory}/`)),
  );
}

/** A catch-all block owns no directory, so its size is read from the files it gathered. */
function outsideViewOf(context: AnalysisContext, block: OutsideBlock): BlockView {
  return sized(
    block,
    block.files.map((path) => context.file(path)),
  );
}

/** Its size and externals, summed and unioned over its files. */
function sized(block: Block, files: readonly CodeFile[]): BlockView {
  return {
    id: block.id,
    name: block.name,
    column: block.column,
    linesOfCode: files.reduce((sum, file) => sum + file.linesOfCode, 0),
    externals: [...new Set(files.flatMap((file) => file.externals))].sort((one, other) =>
      one.localeCompare(other),
    ),
  };
}
