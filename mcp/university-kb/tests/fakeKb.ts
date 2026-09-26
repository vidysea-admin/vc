/**
 * A tiny local HTTP server standing in for the sibling D:/KnowledgeBase service's real
 * `POST /ask` endpoint (contracts B8/B14: tests run offline and exercise a REAL in-process HTTP
 * round trip over a real socket on 127.0.0.1 -- never a mocked `fetch`, never the real network,
 * never the real D:/KnowledgeBase). Each test supplies a `handler` that inspects the real parsed
 * request (method, path, headers, body) and decides the real response.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeKbRequest {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface FakeKbResponse {
  status: number;
  /** Raw response text -- the caller controls JSON.stringify (or deliberately malformed text). */
  body: string;
  headers?: Record<string, string>;
  /** ms to wait after the handler decides the response, before writing it -- lets a test exercise the client's own timeout against a real, still-open connection. */
  delayMs?: number;
}

export type FakeKbHandler = (req: FakeKbRequest) => FakeKbResponse | Promise<FakeKbResponse>;

export interface FakeKbServer {
  url: string;
  close(): Promise<void>;
}

export async function startFakeKb(handler: FakeKbHandler): Promise<FakeKbServer> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const result = await handler({ method: req.method, url: req.url, headers: req.headers, body });
        if (result.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, result.delayMs));
        }
        res.writeHead(result.status, { "content-type": "application/json", ...(result.headers ?? {}) });
        res.end(result.body);
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** A real, minimal, schema-valid `/ask` response body (contract-shaped, per D:/KnowledgeBase apps/web/src/api/types.ts `AskResponse`). */
export function validAskResponseWithCitations(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    answer: "The University of Testland offers a 4-year BSc in Computer Science.",
    verdict: "answered",
    reason: "found a matching course node in the tree index",
    scored: [{ node_id: "course:testland-cs", score: 0.92, reason: "direct name match" }],
    web_used: false,
    insufficient_coverage: false,
    sources: {
      internal: [{ node_id: "course:testland-cs", evidence: { sessionRef: "session-1" } }],
      web: [],
    },
    auditLog: [{ step: "retrieve", provider: "litellm", model: "balanced", costUsd: 0.001 }],
    ...overrides,
  };
}

/** Same shape, but zero citations in BOTH internal and web -- the "uncited answer" case (B2/B21). */
export function validAskResponseWithoutCitations(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return validAskResponseWithCitations({
    sources: { internal: [], web: [] },
    scored: [],
    ...overrides,
  });
}
