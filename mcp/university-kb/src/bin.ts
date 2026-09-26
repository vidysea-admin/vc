#!/usr/bin/env node
/**
 * Stdio entry point for the university-kb MCP server. NOT exercised by tests
 * (contract B8: tests stay offline) -- it is the only place in this package
 * that calls connectFromEnv, which reads MONGODB_URL from the real process
 * environment and opens a live socket via `client.connect()`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectFromEnv } from "@vc/db";
import { createUniversityKbServer } from "./index.js";
import { createKnowledgeBaseClient, loadKbConfigFromEnv } from "./kb-client.js";

async function main(): Promise<void> {
  const { client, db } = connectFromEnv(process.env);
  await client.connect();

  // T-026: optional -- VC_KB_BASE_URL unset means no KB configured, and the server runs with
  // only its two Mongo-backed tools, exactly as before this unit (names only in .env.example,
  // contract B11; never read a real value here beyond process.env at runtime).
  const kbConfig = loadKbConfigFromEnv(process.env);
  const kb = kbConfig ? createKnowledgeBaseClient(kbConfig) : undefined;

  const server = createUniversityKbServer({ db, kb });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await server.close();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("vc-mcp-university-kb failed to start:", error);
  process.exit(1);
});
