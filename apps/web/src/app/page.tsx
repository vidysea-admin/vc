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
