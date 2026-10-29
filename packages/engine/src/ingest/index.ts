// Barrel for the ingest side (spec S4). The package root (src/index.ts) is not edited by this unit;
// see the CORE-REQUEST line in qa/manifests/vca-ingest.md.
export { parseSequelizeMigrations, parseSqlalchemyModels, parseRouterWrites, buildBackendKg, TOOL_TABLE_SEEDS } from "./migrations.js";
export type { ModelParseResult, ToolTableSeed, BuildBackendKgOptions } from "./migrations.js";
export { parseNextAppRoutes, applyServiceCopy, parseStudentHub, buildFrontendKg, joinProductKg, shouldKeepLastGood, KG_MAX_SHRINK, STUDENT_HUB_FILES } from "./routes.js";
export type { KgShape, KeepLastGood } from "./routes.js";
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
  KgProvenance,
  KgSource,
  KgColumn,
  ProductTool,
  FrontendKg,
  BackendKg,
  ModelTable,
  ApiWriter,
  ToolTableEdge,
  EdgeVerifiedBy,
  VcReadEdge,
  ProductKg,
} from "./types.js";
