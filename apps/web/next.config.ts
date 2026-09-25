import type { NextConfig } from "next";

/**
 * T-008. The workspace packages (@vc/*) ship TypeScript source (package.json exports -> src/*.ts),
 * so Next transpiles them. The mongodb driver and LangGraph stay external (server-only, Node APIs).
 * The packages use NodeNext-style `./x.js` specifiers for `./x.ts` files; webpack's extensionAlias
 * maps them (Turbopack in Next 16.3 does not resolve them inside workspace packages, so the scripts
 * pass --webpack).
 */
const config: NextConfig = {
  transpilePackages: ["@vc/db", "@vc/engine", "@vc/providers", "@vc/schemas", "@vc/observability"],
  serverExternalPackages: ["mongodb", "@langchain/langgraph", "@langchain/langgraph-checkpoint-mongodb", "@langchain/core"],
  // Next must not infer the monorepo root from another lockfile higher up the disk.
  webpack: (webpackConfig: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return webpackConfig;
  },
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
};

export default config;
