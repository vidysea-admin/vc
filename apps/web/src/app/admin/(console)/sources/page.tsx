"use client";
import { useState } from "react";
import { SourcesView } from "../../_components/SourcesView";
import type { SourceActionResult } from "../../_lib/types";
import { useSession } from "../../_lib/session";
import { useAction, useLoad } from "../../_lib/use-load";

export default function SourcesPage() {
  const { api, role } = useSession();
  const list = useLoad(() => api.listSources(), "sources");
  const action = useAction();
  const [results, setResults] = useState<Record<string, SourceActionResult | undefined>>({});
  if (!role) return null;
  return (
    <SourcesView
      role={role}
      sources={list.data ?? []}
      results={results}
      error={action.error ?? list.error}
      busy={action.busy}
      onCreate={async input => {
        await action.run(async () => {
          await api.createSource(input);
          list.reload();
        });
      }}
      onTest={async id => {
        await action.run(async () => {
          const r = await api.testSource(id);
          setResults(prev => ({ ...prev, [id]: r }));
        });
      }}
      onSync={async id => {
        await action.run(async () => {
          const r = await api.syncSource(id);
          setResults(prev => ({ ...prev, [id]: r }));
          list.reload();
        });
      }}
      onSetSecret={async (id, secret) => {
        await action.run(async () => {
          await api.setSourceSecret(id, secret);
          list.reload();
        });
      }}
    />
  );
}
