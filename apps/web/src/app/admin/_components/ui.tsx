"use client";
/** Small shared pieces of the admin console (vc-admin-control S8). Plain CSS classes live in ../admin.css. */
import { useState, type ReactNode } from "react";
import type { RevealedKeys } from "../_lib/types";

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="adm-alert" role="alert" data-testid="error-banner">
      {error}
    </div>
  );
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="adm-pagehead">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function ReadOnlyNote({ role }: { role: string }) {
  return (
    <p className="adm-note" data-testid="read-only-note">
      Read-only: your role is {role}, so changes are turned off.
    </p>
  );
}

/** Keys appear here once, from React state. Nothing is written to storage or a URL; a reload drops them. */
export function KeyRevealPanel({ revealed, onDismiss }: { revealed: RevealedKeys | null; onDismiss: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!revealed) return null;
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  };
  return (
    <section className="adm-reveal" aria-live="polite" data-testid="key-reveal">
      <h2>{revealed.title}</h2>
      <p className="adm-note">These keys are shown once. Copy them now: after you close this panel or reload the page they cannot be shown again.</p>
      {revealed.keys.map(k => (
        <div className="adm-keyrow" key={k.label}>
          <span className="adm-badge">{k.label}</span>
          <code data-testid={`revealed-key-${k.label}`}>{k.value}</code>
          <button type="button" className="adm-btn adm-btn-small" onClick={() => void copy(k.label, k.value)}>
            {copied === k.label ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
      <button type="button" className="adm-btn" data-testid="dismiss-reveal" onClick={onDismiss}>
        I have copied the keys
      </button>
    </section>
  );
}

export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s !== "");
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  return iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso;
}
