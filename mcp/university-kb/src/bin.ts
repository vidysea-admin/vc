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

async function main(): Promise<void> {
  const { client, db } = connectFromEnv(process.env);
  await client.connect();

  const server = createUniversityKbServer({ db });
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
