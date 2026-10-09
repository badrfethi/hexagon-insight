import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * How many lines of a file are code and how many are comment.
 *
 * A line is code if anything on it is neither whitespace nor comment, and comment if any comment is
 * on it, so a line with code and a trailing comment counts as both. A blank line is neither. Lines
 * of code — non-blank, non-comment — are what a block's size is measured in (#74, decision 2): the
 * map draws each block's area from its own count, so a reader sees where the code is without
 * reading anything.
 *
 * Comments are found through the parser rather than by pattern, so a `//` inside a string or a
 * template, such as a URL, is not taken for one.
 */
export interface LineCount {
  readonly code: number;
  readonly comment: number;
}

export function countLines(file: ts.SourceFile): LineCount {
  const inComment = commentMask(file);
  const lines = linesOf(file);

  return {
    code: lines.filter((line) => hasCode(file.text, inComment, line)).length,
    comment: lines.filter((line) => inComment.slice(line.start, line.end).includes(true)).length,
  };
}

/**
 * The lines of code one declaration spans, such as one class of several in a file: a Test Double is
 * drawn at its own size, not at the size of the file it shares (`doubles.ts`). Its doc comment is
 * not code, so the count starts at the declaration itself.
 */
export function codeLinesOf(node: ts.Node): number {
  const file = node.getSourceFile();
  const inComment = commentMask(file);
  const start = node.getStart(file);

  return linesOf(file)
    .filter((line) => line.end > start && line.start < node.end)
    .filter((line) => hasCode(file.text, inComment, line)).length;
}

function linesOf(file: ts.SourceFile): Span[] {
  return file
    .getLineStarts()
    .map((start, index, starts) => ({ start, end: starts[index + 1] ?? file.text.length }));
}

const SCRIPT = /\.[cm]?[jt]s$/;
const REMARK = /^\s*(?:#|\/\/|<!--)/;

/**
 * The lines of code in a file read from disk, for the blocks outside the groups (`outside.ts`),
 * whose files the TypeScript program does not all hold: a feature file and the page are code here
 * too. A script is parsed and counted as above; anything else counts its non-blank lines, less the
 * ones opening with a remark, which is all a line-based reading can honestly say.
 */
export function codeLinesIn(path: string): number {
  const text = readFileSync(path, "utf8");

  return SCRIPT.test(path)
    ? countLines(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)).code
    : plainLines(text);
}

function plainLines(text: string): number {
  return text.split("\n").filter((line) => line.trim() !== "" && !REMARK.test(line)).length;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

function hasCode(text: string, inComment: readonly boolean[], line: Span): boolean {
  for (let position = line.start; position < line.end; position++) {
    if (!inComment[position] && text.charAt(position).trim() !== "") {
      return true;
    }
  }

  return false;
}

function commentMask(file: ts.SourceFile): boolean[] {
  const mask = new Array<boolean>(file.text.length).fill(false);

  for (const range of commentRanges(file)) {
    mask.fill(true, range.pos, range.end);
  }

  return mask;
}

function commentRanges(file: ts.SourceFile): ts.CommentRange[] {
  const positions = new Set(tokenPositions(file, file));

  return [...positions].flatMap(
    (position) => ts.getLeadingCommentRanges(file.text, position) ?? [],
  );
}

/** The full start of every node and token, which is where the comments before it begin. */
function tokenPositions(node: ts.Node, file: ts.SourceFile): number[] {
  // A JSDoc block is a comment already; what is inside it is not code with comments before it.
  const children = ts.isJSDoc(node) ? [] : node.getChildren(file);

  return [node.pos, ...children.flatMap((child) => tokenPositions(child, file))];
}
