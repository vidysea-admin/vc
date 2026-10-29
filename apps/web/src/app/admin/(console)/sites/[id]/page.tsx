"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SiteDetailView } from "../../../_components/SiteDetailView";
import type { RevealedKeys } from "../../../_lib/types";
import { useSession } from "../../../_lib/session";
import { useAction, useLoad } from "../../../_lib/use-load";

export default function SiteDetailPage() {
  const { api, role } = useSession();
  const params = useParams<{ id: string }>();
  const siteId = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id);
  const list = useLoad(() => api.listSites(), "sites");
  const action = useAction();
  const [revealed, setRevealed] = useState<RevealedKeys | null>(null);
  if (!role) return null;
  const site = (list.data ?? []).find(s => s.partnerId === siteId);
  if (!site) {
    return (
      <div>
        <p>
          <Link href="/admin/sites">Back to sites</Link>
        </p>
        <p className="adm-note" role={list.error ? "alert" : "status"}>
          {list.loading ? "Loading..." : (list.error ?? "That site was not found.")}
        </p>
      </div>
    );
  }
  return (
    <SiteDetailView
      key={`${site.partnerId}:${site.name}:${site.allowedOrigins.join("|")}:${JSON.stringify(site.memoryPolicy ?? null)}`}
      role={role}
      site={site}
      revealed={revealed}
      error={action.error ?? list.error}
      busy={action.busy}
      onDismissReveal={() => setRevealed(null)}
      onSave={async patch => {
        await action.run(async () => {
          await api.updateSite(site.partnerId, patch);
          list.reload();
        });
      }}
      onRotate={async scope => {
        await action.run(async () => {
          const out = await api.rotateKey(site.partnerId, scope);
          setRevealed({ title: `New ${scope} key for ${site.name}`, keys: [{ label: scope, value: out.key }] });
          list.reload();
        });
      }}
      onRevoke={async () => {
        await action.run(async () => {
          await api.revokeSite(site.partnerId);
          list.reload();
        });
      }}
      onUnrevoke={async () => {
        await action.run(async () => {
          await api.unrevokeSite(site.partnerId);
          list.reload();
        });
      }}
    />
  );
}
