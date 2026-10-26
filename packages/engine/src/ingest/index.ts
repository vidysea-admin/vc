// Barrel for the ingest side (spec S4). The package root (src/index.ts) is not edited by this unit;
// see the CORE-REQUEST line in qa/manifests/vca-ingest.md.
export { parseSequelizeMigrations } from "./migrations.js";
export { parseNextAppRoutes } from "./routes.js";
export { fetchRepoFiles, GithubFetchError } from "./github.js";
export type { GithubPort, GithubTreeEntry, GithubBlob, RepoCoordinates, FetchRepoOptions, SkipReason } from "./github.js";
export type {
  RepoFile,
  IngestDiagnostic,
  SchemaColumn,
  SchemaTable,
  SchemaMap,
  MigrationParseResult,
  NavRoute,
  NavCatalogue,
} from "./types.js";
