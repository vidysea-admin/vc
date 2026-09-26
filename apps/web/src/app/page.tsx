import Link from "next/link";
import { getRuntime } from "../server/runtime";
import { LABELS } from "../components/labels";

export const dynamic = "force-dynamic";

/** Index: in demo mode, the seeded synthetic threads; in live mode, nothing is listed. */
export default async function Home() {
  const rt = await getRuntime();
  const threads = Object.values(rt.threads ?? {});
  return (
    <main className="shell">
      <header className="head">
        <h1>{LABELS.title}</h1>
      </header>
      {/* T-021: entry point to the "start a new session" demo flow (runtime failover + Retry). */}
      <p>
        <Link className="mono" href="/sessions/new" data-testid="new-session-link">
          {LABELS.newSessionLinkHome}
        </Link>
      </p>
      <ul className="thread-list">
        {threads.map((id) => (
          <li key={id}>
            <Link className="mono" href={`/approvals/${encodeURIComponent(id)}`}>
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
