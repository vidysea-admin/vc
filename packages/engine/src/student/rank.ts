/**
 * P1 U6b profile-aware option ranking (spec A16 / A16b engine side, contract B24.8; D-086 Q3, D-087 Q15,
 * signature sheet P-8). Pure deterministic code: no LLM, no network, no clock, no persistence (D-093 4A/6A).
 *
 * Inputs: an authenticated student id, a list of option ids, the profile facts, an optional weight vector and an
 * `OptionDataPort`. The score of an option is the weighted sum of four components in [0, 1], higher = better:
 *  - fit                computed HERE from the profile facts vs the option's attributes (`DEFAULT_FACT_KEY_MAP`);
 *  - cost               read from the port, each with a KB sourceId that must be among the option's sources;
 *  - scholarshipChance  a number without a resolvable source, outside [0, 1] or not finite is MISSING, never
 *  - visaEase           clamped and never guessed.
 * Numbers never come from a model. An option with a missing component that has weight > 0 is
 * `insufficient_data`: no score, listed after every ranked option (by option id).
 *
 * Fact sources (A16b): only `pathlynks` and `student-confirmed` facts enter. A fact carrying a `status` other
 * than "confirmed", or any other source label (a chat-extracted proposal), is ignored and counted in
 * `ignoredFactCount`. [ASSUMPTION] when Pathlynks and the student give different values for one key, the
 * student's confirmed value wins (it is the student's own correction).
 *
 * Open (HUMAN_GATE Q-U6b-1/2): no structured source of per-option numbers exists in the KB today, and the
 * option list and the fact keys that feed "fit" are not decided. `DEFAULT_FACT_KEY_MAP` is a synthetic
 * default; the real adapter behind `OptionDataPort` is NOT PROVEN.
 *
 * Ordering is total and deterministic: ranked options by score (rounded to 6 decimals) desc, then option id
 * ascending (code-unit order); insufficient options by option id. Duplicate option ids collapse to one.
 */
import { PROFILE_FACT_SOURCES, type Claim, type ProfileFact, type Source } from "@vc/schemas";
import { DEFAULT_RANK_WEIGHTS, RANK_COMPONENTS, validateRankWeights, type RankComponent, type RankWeights } from "./rank-weights.js";

export {
  DEFAULT_RANK_WEIGHTS,
  DEFAULT_RANKING_PROFILE,
  RANK_COMPONENTS,
  rankingProfileFor,
  validateRankWeights,
  type RankComponent,
  type RankWeights,
  type WeightsValidation,
} from "./rank-weights.js";

export const MAX_RANK_OPTIONS = 25;
const MAX_CLAIM_SOURCE_IDS = 20; // ClaimSchema.sourceIds max
const MAX_LABEL = 200;

/** One number from the data port with the KB source that carries it. Value is normalised: 0..1, higher = better. */
export interface OptionMetric {
  value: number;
  sourceId: string;
}
export interface OptionAttribute {
  value: string;
  sourceId: string;
}
/** What the data port knows about one option. Every field except `optionId` may be absent. */
export interface OptionData {
  optionId: string;
  label?: string;
  /** Facts about the option that profile facts are compared with (e.g. country, field, level). */
  attributes?: Record<string, OptionAttribute>;
  /** Affordability, 1 = cheapest. */
  cost?: OptionMetric;
  scholarshipChance?: OptionMetric;
  visaEase?: OptionMetric;
  /** The KB sources the ids above refer to. A metric whose sourceId is not listed here is treated as missing. */
  sources?: Source[];
}
export interface OptionDataPort {
  get(optionId: string): OptionData | undefined;
}

/** [ASSUMPTION, Q-U6b-2] profile fact key -> option attribute key. Synthetic default; configurable per call. */
export const DEFAULT_FACT_KEY_MAP: Readonly<Record<string, string>> = Object.freeze({
  "target-country": "country",
  target_country: "country",
  "field-of-study": "field",
  "study-level": "level",
});

export interface RankFactInput {
  key: string;
  value: string;
  source: string;
  status?: string;
}
export interface RankInput {
  /** The authenticated student id from the student JWT. Absent or blank = no ranking. */
  studentId: string | undefined;
  optionIds: readonly string[];
  facts: readonly RankFactInput[];
  /** Unvalidated weight config; absent = the default student-success vector. */
  weights?: unknown;
  factKeyMap?: Readonly<Record<string, string>>;
}

export type RankComponents = Record<RankComponent, number | null>;
export interface RankedOption {
  optionId: string;
  label: string;
  /** 1-based position among ranked options; null when insufficient_data. */
  rank: number | null;
  status: "ranked" | "insufficient_data";
  score: number | null;
  components: RankComponents;
  /** Components that could not be read (only those with weight > 0 block the score). */
  missing: RankComponent[];
  sourceIds: string[];
  /** The facts that moved this option's fit (empty when the fit weight is 0). */
  profileFactsUsed: ProfileFact[];
}
export type RankResult =
  | {
      status: "ranked";
      rankingProfile: string;
      weights: RankWeights;
      weightsNormalised: boolean;
      options: RankedOption[];
      claims: Claim[];
      sources: Source[];
      profileFactsUsed: ProfileFact[];
      ignoredFactCount: number;
    }
  | { status: "refused"; reason: "sign_in_required" | "no_options" | "too_many_options" }
  | { status: "refused"; reason: "invalid_weights"; detail: string };

const norm = (s: string): string => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: string[]): string[] => [...new Set(xs)].sort(cmp);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Keep only usable facts; one per key (student-confirmed beats pathlynks); stable order by key. */
function usableFacts(facts: readonly RankFactInput[]): { facts: ProfileFact[]; ignored: number } {
  const byKey = new Map<string, ProfileFact>();
  let ignored = 0;
  for (const f of facts) {
    const okSource = (PROFILE_FACT_SOURCES as readonly string[]).includes(f.source);
    const okStatus = f.status === undefined || f.status === "confirmed";
    const okShape = typeof f.key === "string" && f.key.length > 0 && typeof f.value === "string" && f.value.trim().length > 0;
    if (!okSource || !okStatus || !okShape) {
      ignored++;
      continue;
    }
    const fact: ProfileFact = { key: f.key, value: f.value, source: f.source as ProfileFact["source"] };
    const prior = byKey.get(fact.key);
    if (!prior || ((prior.source === "pathlynks" || prior.source === "vidysea") && fact.source === "student-confirmed")) byKey.set(fact.key, fact);
  }
  return { facts: [...byKey.values()].sort((a, b) => cmp(a.key, b.key)), ignored };
}

function readMetric(data: OptionData | undefined, name: "cost" | "scholarshipChance" | "visaEase", known: Set<string>): OptionMetric | undefined {
  const m = data?.[name];
  if (!m || typeof m.value !== "number" || !Number.isFinite(m.value) || m.value < 0 || m.value > 1) return undefined;
  if (typeof m.sourceId !== "string" || m.sourceId.length === 0 || !known.has(m.sourceId)) return undefined;
  return m;
}

function computeFit(
  data: OptionData | undefined,
  facts: ProfileFact[],
  keyMap: Readonly<Record<string, string>>,
  known: Set<string>,
): { fit: number; used: ProfileFact[]; sourceIds: string[] } | undefined {
  let eligible = 0;
  let matched = 0;
  const used: ProfileFact[] = [];
  const sourceIds: string[] = [];
  for (const f of facts) {
    const attrKey = has(keyMap, f.key) ? keyMap[f.key] : undefined;
    if (attrKey === undefined) continue;
    const attr = data?.attributes && has(data.attributes, attrKey) ? data.attributes[attrKey] : undefined;
    if (!attr || typeof attr.value !== "string" || !known.has(attr.sourceId)) continue;
    eligible++;
    if (norm(attr.value) === norm(f.value)) matched++;
    used.push(f);
    sourceIds.push(attr.sourceId);
  }
  if (eligible === 0) return undefined;
  return { fit: matched / eligible, used, sourceIds };
}

const f2 = (n: number | null): string => (n === null ? "n/a" : n.toFixed(2));

export function rankOptions(input: RankInput, port: OptionDataPort): RankResult {
  // B24.8: no authenticated student, no ranking. Checked first, before the port or the facts are touched.
  if (typeof input.studentId !== "string" || input.studentId.trim().length === 0) return { status: "refused", reason: "sign_in_required" };

  const optionIds = uniqSorted([...input.optionIds].filter((id) => typeof id === "string" && id.length > 0));
  if (optionIds.length === 0) return { status: "refused", reason: "no_options" };
  if (optionIds.length > MAX_RANK_OPTIONS) return { status: "refused", reason: "too_many_options" };

  const wv = validateRankWeights(input.weights === undefined ? { ...DEFAULT_RANK_WEIGHTS } : input.weights);
  if (!wv.ok) return { status: "refused", reason: "invalid_weights", detail: wv.detail };
  const { weights } = wv;

  const { facts, ignored } = usableFacts(input.facts);
  const keyMap = input.factKeyMap ?? DEFAULT_FACT_KEY_MAP;

  const sourcesById = new Map<string, Source>();
  const built = optionIds.map((optionId) => {
    const data = port.get(optionId);
    const own = new Map<string, Source>();
    for (const s of data?.sources ?? []) if (s && typeof s.id === "string" && s.id.length > 0 && !own.has(s.id)) own.set(s.id, s);
    const known = new Set(own.keys());

    const components: RankComponents = { fit: null, cost: null, scholarshipChance: null, visaEase: null };
    const cited: string[] = [];
    let factsUsed: ProfileFact[] = [];

    const fit = computeFit(data, facts, keyMap, known);
    if (fit) {
      components.fit = round6(fit.fit);
      cited.push(...fit.sourceIds);
      if (weights.fit > 0) factsUsed = fit.used;
    }
    for (const name of ["cost", "scholarshipChance", "visaEase"] as const) {
      const m = readMetric(data, name, known);
      if (m) {
        components[name] = m.value;
        cited.push(m.sourceId);
      }
    }
    const missing = RANK_COMPONENTS.filter((k) => components[k] === null);
    const ranked = missing.every((k) => weights[k] === 0);
    let score: number | null = null;
    if (ranked) {
      let s = 0;
      for (const k of RANK_COMPONENTS) s += weights[k] * (components[k] ?? 0);
      score = round6(s);
    }
    const sourceIds = uniqSorted(cited);
    for (const id of sourceIds) if (!sourcesById.has(id)) sourcesById.set(id, own.get(id)!);
    const label = (typeof data?.label === "string" && data.label.trim().length > 0 ? data.label.trim() : optionId).slice(0, MAX_LABEL);
    return { optionId, label, components, missing, sourceIds, score, ranked, factsUsed };
  });

  // Two separately sorted groups, concatenated: "insufficient last" is structural, not a comparator accident.
  const rankedGroup = built.filter((x) => x.ranked).sort((x, y) => (y.score as number) - (x.score as number) || cmp(x.optionId, y.optionId));
  const insufficientGroup = built.filter((x) => !x.ranked).sort((x, y) => cmp(x.optionId, y.optionId));
  const ordered = [...rankedGroup, ...insufficientGroup];

  let n = 0;
  const options: RankedOption[] = ordered.map((b) => ({
    optionId: b.optionId,
    label: b.label,
    rank: b.ranked ? ++n : null,
    status: b.ranked ? "ranked" : "insufficient_data",
    score: b.score,
    components: b.components,
    missing: [...b.missing],
    sourceIds: b.sourceIds,
    profileFactsUsed: b.factsUsed,
  }));

  const claims: Claim[] = options.map((o) =>
    o.status === "ranked"
      ? {
          text: `#${o.rank} ${o.label}: overall ${f2(o.score)} (fit ${f2(o.components.fit)}, cost ${f2(o.components.cost)}, scholarship chance ${f2(o.components.scholarshipChance)}, visa ease ${f2(o.components.visaEase)})`,
          kind: "number" as const,
          sourceIds: o.sourceIds.slice(0, MAX_CLAIM_SOURCE_IDS),
          status: "attributed" as const,
        }
      : {
          text: `${o.label}: not ranked, missing data for ${o.missing.join(", ")}`,
          kind: "fact" as const,
          sourceIds: o.sourceIds.slice(0, MAX_CLAIM_SOURCE_IDS),
          status: "unverified" as const,
        },
  );

  const usedMap = new Map<string, ProfileFact>();
  for (const o of options) {
    if (o.status !== "ranked") continue;
    for (const f of o.profileFactsUsed) usedMap.set(`${f.key}\u0000${f.value}\u0000${f.source}`, f);
  }
  const profileFactsUsed = [...usedMap.values()].sort((a, b) => cmp(a.key, b.key));

  return {
    status: "ranked",
    rankingProfile: wv.rankingProfile,
    weights,
    weightsNormalised: wv.normalised,
    options,
    claims,
    sources: [...sourcesById.values()].sort((a, b) => cmp(a.id, b.id)),
    profileFactsUsed,
    ignoredFactCount: ignored,
  };
}
