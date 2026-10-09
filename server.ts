import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, sep } from "node:path";
import { contextOf } from "./analysis/context.js";
import { mapOf } from "./analysis/map.js";
import { testsView } from "./analysis/tests.js";
import { ReadFailure, readModel } from "./readers/read.js";

/**
 * `hexagon-insight serve`: serves the page, and the map it draws, from the working tree of the repository it is started in, as it is now.
 *
 * Nothing is cached between requests (#74, decision 4): each one reads the target into a model of
 * its own (`readers/read.ts`). The page is read from disk on every load as well, so an edit to it
 * shows on reload like an edit to the code does. It listens on `127.0.0.1` only: it is a view of
 * one checkout for the person sitting at it.
 */
const ROOT = join(process.cwd(), sep);
const PAGE = new URL("./page.html", import.meta.url);
const PORT = Number(process.env.INSIGHT_PORT ?? 4174);

const ROUTES: Readonly<Record<string, () => Promise<Reply>>> = {
  "/": async () => ({ type: "text/html; charset=utf-8", body: await readFile(PAGE, "utf8") }),
  "/map.json": async () =>
    await json(readModel(ROOT).then(async (model) => await mapOf(contextOf(model), ROOT))),
  // Its own load, and not the map's: it reads the target and runs nothing, so it does not wait on
  // the rules the map's breaks come from (`tests.ts`).
  "/tests.json": async () => await json(readModel(ROOT).then((model) => testsView(contextOf(model)))),
};

async function json(value: Promise<unknown>): Promise<Reply> {
  return { type: "application/json; charset=utf-8", body: JSON.stringify(await value) };
}

interface Reply {
  readonly type: string;
  readonly body: string;
  readonly status?: number;
}

async function replyTo(request: IncomingMessage): Promise<Reply> {
  const url = new URL(request.url ?? "/", "http://insight");
  const route = ROUTES[url.pathname];

  return route === undefined
    ? { status: 404, type: "text/plain; charset=utf-8", body: "Not found" }
    : await route();
}

function send(response: ServerResponse, reply: Reply): void {
  response.writeHead(reply.status ?? 200, {
    "content-type": reply.type,
    "cache-control": "no-store",
  });
  response.end(reply.body);
}

/** A target that cannot be read shows why, in place of the map; anything else shows its stack. */
function failure(error: unknown): Reply {
  if (error instanceof ReadFailure) {
    return { status: 422, type: "text/plain; charset=utf-8", body: error.message };
  }

  const body = error instanceof Error ? (error.stack ?? error.message) : String(error);

  return { status: 500, type: "text/plain; charset=utf-8", body };
}

createServer((request, response) => {
  void replyTo(request)
    .catch(failure)
    .then((reply) => {
      send(response, reply);
    });
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`insight: http://127.0.0.1:${String(PORT)}/\n`);
});
