import { type Arrow, arrowsOf, incomingPortGroupsOf } from "./arrows.js";
import type { Block, Column } from "./blocks.js";
import { type Break, breaksOf } from "./breaks.js";
import { type AnalysisContext, createContext } from "./context.js";
import { externalsIn, externalsOf } from "./externals.js";
import { codeLinesIn, countLines } from "./lines.js";
import { managedAdapters } from "./managed.js";
import type { OutsideBlock } from "./outside.js";

/** The map itself, computed from the working tree for one load, and drawn as soon as it answers. */
export interface InsightMap {
  /** Left to right, and only those that hold a block. */
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
 * implements no port but serves outgoing adapters, such as `process-runner`.
 */
export type Lane = "incoming-adapters" | "staff" | "suppliers" | "outgoing-adapters" | "outside";

export interface MapColumn {
  readonly lane: Lane;
  readonly title: string;
  readonly blocks: readonly BlockView[];
}

export interface BlockView {
  readonly id: string;
  readonly name: string;
  readonly column: Column;
  /**
   * Whether an adapter is managed (`managed.ts`); `null` for a group, which is neither. The page
   * draws a managed adapter hollow and an unmanaged one filled, so the distinction is readable down
   * the column without reading a word.
   */
  readonly managed: boolean | null;
  /** Non-blank, non-comment lines across the block's files. The block's area is drawn from it. */
  readonly linesOfCode: number;
  /**
   * What the block depends on outside this repository — npm packages and `node:` modules, sorted
   * (`externals.ts`).
   *
   * It is here because the arrows only show what a block leans on **inside** the hexagon, so ten
   * packages behind a block read as no weight at all. This is the rest of what it leans on.
   */
  readonly externals: readonly string[];
}

/** The group columns, which are cut out of `context.blocks`. */
const LANES: readonly { readonly lane: Lane; readonly title: string }[] = [
  { lane: "incoming-adapters", title: "Incoming adapters" },
  { lane: "staff", title: "Staff" },
  { lane: "suppliers", title: "Suppliers" },
  { lane: "outgoing-adapters", title: "Outgoing adapters" },
];

/** One load of the map. It runs no feature: only the rules, which its breaks come from. */
export async function load(root: string): Promise<InsightMap> {
  const context = createContext(root);
  const breaks = await breaksOf(context);

  return {
    columns: columnsOf(context),
    strip: context.outside.map(outsideViewOf),
    arrows: arrowsOf(context),
    breaks,
  };
}

function columnsOf(context: AnalysisContext): readonly MapColumn[] {
  const lanes = new Map(context.blocks.map((block) => [block, laneOf(context, block)] as const));

  return LANES.map(({ lane, title }) => ({
    lane,
    title,
    blocks: context.blocks
      .filter((block) => lanes.get(block) === lane)
      .map((block) => viewOf(context, block)),
  })).filter((column) => column.blocks.length > 0);
}

const LANE_OF: Readonly<Record<Column, (context: AnalysisContext, block: Block) => Lane>> = {
  staff: () => "staff",
  suppliers: () => "suppliers",
  adapters: (context, block) =>
    incomingPortGroupsOf(context, block).length > 0 ? "incoming-adapters" : "outgoing-adapters",
  outside: () => "outside",
};

function laneOf(context: AnalysisContext, block: Block): Lane {
  return LANE_OF[block.column](context, block);
}

function viewOf(context: AnalysisContext, block: Block): BlockView {
  const files = context.filesOf(block);

  return {
    id: block.id,
    name: block.name,
    column: block.column,
    managed: block.column === "adapters" ? managedAdapters(context).has(block.name) : null,
    linesOfCode: files.reduce((sum, file) => sum + countLines(file).code, 0),
    externals: externalsOf(files),
  };
}

/** A catch-all block owns no directory, so its size is read from the files it gathered. */
function outsideViewOf(block: OutsideBlock): BlockView {
  return {
    id: block.id,
    name: block.name,
    column: block.column,
    managed: null,
    linesOfCode: block.files.reduce((sum, file) => sum + codeLinesIn(file), 0),
    externals: externalsIn(block.files),
  };
}
