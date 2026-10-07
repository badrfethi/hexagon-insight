import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";

/**
 * One kind of test as ADR-0031 names it, the folder its tests live in, and why it has none.
 *
 * The Tests view draws a lane per kind (#166). What a lane holds and why an empty one is empty are
 * read from the ADR rather than written here, because the ADR is where they are decided: its table
 * says where each kind lives, `—` for a kind with no folder, and a bullet under it says why each
 * empty kind is empty. A kind that gains a folder in the table fills its lane with no change to
 * insight, and one whose reason is reworded says so on the next load.
 */
export interface TestKind {
  /** As the table's `Kind` column writes it, such as `Acceptance test`. */
  readonly kind: string;
  /** The folder its tests live in, relative to the root and without a slash; `null` for `—`. */
  readonly folder: string | null;
  /** The ADR's sentence for why it has no tests, such as "No core tests, because …"; `null` if none. */
  readonly reason: string | null;
}

const ADRS = "docs/adr";
const KINDS_ADR = /^0031-.*\.md$/;

/**
 * The kinds in the order the Tests view reads, outside in: what a Client meets, the hexagon through
 * its incoming port, its core, and the suppliers at the far side (#165, decision 4). It is the only
 * thing about the kinds insight states itself; a kind the ADR adds and this does not order comes last.
 */
const ORDER = ["Entry point test", "Acceptance test", "Core test", "Contract test"];

export function testKinds(root: string): readonly TestKind[] {
  const lines = adrLines(root);
  const reasons = bullets(lines);

  return tableRows(lines)
    .map((row) => ({
      kind: row.kind,
      folder: folderIn(row.lives),
      reason: reasonFor(row, reasons),
    }))
    .sort((one, other) => rank(one.kind) - rank(other.kind));
}

function adrLines(root: string): readonly string[] {
  const folder = posix.join(root, ADRS);
  const name = existsSync(folder)
    ? readdirSync(folder).find((file) => KINDS_ADR.test(file))
    : undefined;

  return name === undefined ? [] : readFileSync(posix.join(folder, name), "utf8").split("\n");
}

function rank(kind: string): number {
  const index = ORDER.indexOf(kind);

  return index < 0 ? ORDER.length : index;
}

interface Row {
  readonly kind: string;
  readonly lives: string;
}

/** The rows of the table whose header has a `Kind` and a `Lives in` column. */
function tableRows(lines: readonly string[]): readonly Row[] {
  const start = lines.findIndex((line) => isRow(line) && cellsOf(line).includes("Lives in"));
  const header = cellsOf(lines[start] ?? "");
  const rows = start < 0 ? [] : bodyOf(lines.slice(start + 1));

  return rows.map((cells) => ({
    kind: cells[header.indexOf("Kind")] ?? "",
    lives: cells[header.indexOf("Lives in")] ?? "",
  }));
}

function bodyOf(lines: readonly string[]): readonly (readonly string[])[] {
  const end = lines.findIndex((line) => !isRow(line));

  return (end < 0 ? lines : lines.slice(0, end))
    .map(cellsOf)
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));
}

function isRow(line: string): boolean {
  return line.trimStart().startsWith("|");
}

function cellsOf(line: string): readonly string[] {
  return line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** `` `features/` `` is the folder `features`; `—`, or anything that is not a path, is none. */
function folderIn(cell: string): string | null {
  return /^`(?<path>[^`]+?)\/?`$/.exec(cell)?.groups?.path ?? null;
}

/** The ADR's bullets, each joined onto one line with its emphasis dropped. */
function bullets(lines: readonly string[]): readonly string[] {
  return lines
    .reduce<readonly string[]>(joinBullet, [])
    .map((bullet) => bullet.replaceAll("**", "").replaceAll("`", ""));
}

/** A line opening `- ` starts a bullet, an indented one carries on the last, and others are not bullets. */
function joinBullet(joined: readonly string[], line: string): readonly string[] {
  if (line.startsWith("- ")) {
    return [...joined, line.slice(2)];
  }

  return line.startsWith("  ") ? carriedOn(joined, line) : joined;
}

function carriedOn(joined: readonly string[], line: string): readonly string[] {
  const last = joined.at(-1);

  return last === undefined ? joined : [...joined.slice(0, -1), `${last} ${line.trim()}`];
}

/** The first sentence of the bullet that opens "No <kind> tests", such as "No core tests, because …". */
function reasonFor(row: Row, reasons: readonly string[]): string | null {
  const opening = `No ${row.kind.replace(/ test$/, "").toLowerCase()} tests`;
  const bullet = reasons.find((reason) => reason.startsWith(opening));

  return bullet === undefined ? null : firstSentence(bullet);
}

/** Up to the first full stop that ends a sentence: one followed by a capital, or by nothing. */
export function firstSentence(text: string): string {
  return (
    /^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/.exec(text.trim())?.[0].replace(/\s+/g, " ") ?? text.trim()
  );
}
