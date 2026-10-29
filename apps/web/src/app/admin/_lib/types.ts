/**
 * vc-admin-control S3 / S8: the shapes the admin UI reads from the admin API.
 * Site records mirror apps/api/src/partners.ts PartnerSummary (the S3 site routes reuse addPartner / rotatePartner / revokePartner / listPartners).
 * The S3 text does not spell out the other response bodies; the readers in client.ts accept the documented shape and refuse anything else.
 */
export type AdminRole = "super-admin" | "admin" | "viewer";
export type KeyScope = "pub" | "srv";

export interface MemoryPolicy {
  shortTermEnabled: boolean;
  longTermEnabled: boolean;
  learningEnabled: boolean;
  contextMessages: number;
  maxFacts: number;
}

export interface SiteSummary {
  memoryPolicy?: MemoryPolicy;
  partnerId: string;
  name: string;
  keys: Record<KeyScope, { prefix: string; rotatedAt: string | null }>;
  allowedOrigins: string[];
  status: "active" | "revoked";
  createdAt: string;
}

/** A key shown once: held in React state only, never persisted. */
export interface RevealedKeys {
  title: string;
  keys: { label: string; value: string }[];
}

export type GithubService = "frontend" | "auth" | "school" | "career" | "other";

export interface GithubSourceInput {
  kind: "github";
  id: string;
  owner: string;
  repo: string;
  branch: string;
  service: GithubService;
  tokenRef?: string;
  siteId?: string;
  platform?: "pathlynks" | "vidysea";
  enabled?: boolean;
}
export interface PostgresSourceInput {
  kind: "postgres";
  id: string;
  host: string;
  port: number;
  database: string;
  user: string;
  sslmode: "require" | "verify-full";
  passwordRef: string;
  siteId?: string;
  platform?: "pathlynks" | "vidysea";
  enabled?: boolean;
  tables: string[];
}
export type SourceInput = GithubSourceInput | PostgresSourceInput;

/** S2 `sources` document as the API returns it: non-secret config plus a boolean. Never a secret. */
export interface SourceSummary {
  id: string;
  siteId: string;
  kind: "github" | "postgres";
  config: Record<string, unknown>;
  hasSecret: boolean;
  lastSync?: { at: string; status: string; counts?: Record<string, number> };
}

export interface SourceActionResult {
  ok: boolean;
  message: string;
}

export interface AdminSummary {
  id: string;
  email: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  actorId: string;
  action: string;
  target: string;
  ok: boolean;
}

/** S2 aggregateMetrics. */
export interface Metrics {
  perSiteDay: { siteId: string; day: string; conversations: number }[];
  activeStudents: number;
  chatVsVoice: { chat: number; voice: number };
  tokens: number;
  costUsd: number;
  costPerStudentInr: number;
  latencyP50: number;
  latencyP95: number;
  guardrailHits: number;
  unanswered: number;
}

export interface MetricsQuery {
  from: string;
  to: string;
  siteId?: string;
}
