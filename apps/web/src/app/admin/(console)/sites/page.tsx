"use client";
import { useState } from "react";
import { SitesView } from "../../_components/SitesView";
import type { RevealedKeys } from "../../_lib/types";
import { useSession } from "../../_lib/session";
import { useAction, useLoad } from "../../_lib/use-load";

export default function SitesPage() {
  const { api, role } = useSession();
  const list = useLoad(() => api.listSites(), "sites");
  const action = useAction();
  const [revealed, setRevealed] = useState<RevealedKeys | null>(null);
  if (!role) return null;
  return (
    <SitesView
      role={role}
      sites={list.data ?? []}
      revealed={revealed}
      error={action.error ?? list.error}
      busy={action.busy}
      onDismissReveal={() => setRevealed(null)}
      onCreate={async input => {
        return action.run(async () => {
          const created = await api.createSite(input);
          setRevealed({ title: `Keys for ${created.site.name || input.name}`, keys: created.keys });
          list.reload();
        });
      }}
      onRevoke={async id => {
        await action.run(async () => {
          await api.revokeSite(id);
          list.reload();
        });
      }}
      onUnrevoke={async id => {
        await action.run(async () => {
          await api.unrevokeSite(id);
          list.reload();
        });
      }}
    />
  );
}
