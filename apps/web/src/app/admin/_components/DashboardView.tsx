"use client";
import type { ReactNode } from "react";
import { COST_TARGET_INR, costStatus, formatInr, formatInt, formatUsd } from "../_lib/format";
import type { Metrics } from "../_lib/types";
import { ErrorBanner, PageHeading } from "./ui";

export interface DashboardRange {
  from: string;
  to: string;
}

export interface DashboardViewProps {
  metrics: Metrics | null;
  sites: { id: string; name: string }[];
  range: DashboardRange;
  siteId: string;
  error: string | null;
  loading: boolean;
  onChange: (next: { from: string; to: string; siteId: string }) => void;
}

function Tile({ label, testId, value, unit, children }: { label: string; testId: string; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="adm-tile">
      <div className="adm-tile-label">{label}</div>
      <div className="adm-tile-value">
        <span data-testid={testId}>{value}</span>
        {unit ? <span className="adm-tile-unit"> {unit}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function DashboardView({ metrics, sites, range, siteId, error, loading, onChange }: DashboardViewProps) {
  const total = metrics ? metrics.chatVsVoice.chat + metrics.chatVsVoice.voice : 0;
  const chatPct = total > 0 && metrics ? Math.round((metrics.chatVsVoice.chat / total) * 100) : 0;
  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? id;
  return (
    <div>
      <PageHeading title="Dashboard" />
      <ErrorBanner error={error} />
      <form className="adm-filters" onSubmit={e => e.preventDefault()}>
        <label className="adm-field">
          <span>From</span>
          <input type="date" value={range.from} onChange={e => onChange({ from: e.target.value, to: range.to, siteId })} data-testid="filter-from" />
        </label>
        <label className="adm-field">
          <span>To</span>
          <input type="date" value={range.to} onChange={e => onChange({ from: range.from, to: e.target.value, siteId })} data-testid="filter-to" />
        </label>
        <label className="adm-field">
          <span>Site</span>
          <select value={siteId} onChange={e => onChange({ from: range.from, to: range.to, siteId: e.target.value })} data-testid="filter-site">
            <option value="">All sites</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </form>

      {!metrics ? (
        <p className="adm-note" data-testid="dashboard-loading">
          {loading ? "Loading..." : "No data yet."}
        </p>
      ) : (
        <>
          <section className="adm-tiles" aria-label="Key numbers">
            <Tile label="Active students" testId="metric-active-students" value={formatInt(metrics.activeStudents)} />
            <Tile label="Tokens" testId="metric-tokens" value={formatInt(metrics.tokens)} />
            <Tile label="Cost (USD)" testId="metric-cost-usd" value={formatUsd(metrics.costUsd)} />
            <Tile label="Cost per student" testId="metric-cost-per-student" value={formatInr(metrics.costPerStudentInr)} unit="INR">
              <div className="adm-tile-sub">
                target {COST_TARGET_INR} INR:{" "}
                <span className={costStatus(metrics.costPerStudentInr) === "under" ? "adm-ok" : "adm-bad"} data-testid="cost-status">
                  {costStatus(metrics.costPerStudentInr) === "under" ? "Under target" : "Over target"}
                </span>
              </div>
            </Tile>
            <Tile label="Latency p50" testId="metric-latency-p50" value={String(Math.round(metrics.latencyP50))} unit="ms" />
            <Tile label="Latency p95" testId="metric-latency-p95" value={String(Math.round(metrics.latencyP95))} unit="ms" />
            <Tile label="Guardrail hits" testId="metric-guardrail" value={String(Math.round(metrics.guardrailHits))} />
            <Tile label="Unanswered" testId="metric-unanswered" value={String(Math.round(metrics.unanswered))} />
          </section>

          <section className="adm-card" aria-label="Chat versus voice">
            <h2>Chat vs voice</h2>
            <div className="adm-bar" role="img" aria-label={`Chat ${chatPct} percent, voice ${total > 0 ? 100 - chatPct : 0} percent`}>
              <div className="adm-bar-chat" style={{ width: `${chatPct}%` }} />
            </div>
            <p className="adm-bar-legend">
              Chat <span data-testid="metric-chat">{metrics.chatVsVoice.chat}</span> / Voice <span data-testid="metric-voice">{metrics.chatVsVoice.voice}</span>
            </p>
          </section>

          <section className="adm-card" aria-label="Conversations per site per day">
            <h2>Conversations per site per day</h2>
            {metrics.perSiteDay.length === 0 ? (
              <p className="adm-note">No conversations in this range.</p>
            ) : (
              <div className="adm-scroll">
                <table className="adm-table" data-testid="per-site-day">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Day</th>
                      <th className="adm-num">Conversations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.perSiteDay.map(r => (
                      <tr key={`${r.siteId}-${r.day}`}>
                        <td>
                          {siteName(r.siteId)} <span className="adm-muted">{r.siteId}</span>
                        </td>
                        <td>{r.day}</td>
                        <td className="adm-num">{r.conversations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
