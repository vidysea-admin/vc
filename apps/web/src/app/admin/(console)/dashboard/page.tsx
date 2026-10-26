"use client";
import { useState } from "react";
import { DashboardView } from "../../_components/DashboardView";
import { defaultRange, metricsWindow } from "../../_lib/format";
import { useSession } from "../../_lib/session";
import { useLoad } from "../../_lib/use-load";

export default function DashboardPage() {
  const { api } = useSession();
  const [range, setRange] = useState(() => defaultRange());
  const [siteId, setSiteId] = useState("");
  const sites = useLoad(() => api.listSites(), "sites");
  const metrics = useLoad(() => api.metrics({ ...metricsWindow(range), siteId: siteId || undefined }), `${range.from}|${range.to}|${siteId}`);
  return (
    <DashboardView
      metrics={metrics.data}
      sites={(sites.data ?? []).map(s => ({ id: s.partnerId, name: s.name }))}
      range={range}
      siteId={siteId}
      error={metrics.error}
      loading={metrics.loading}
      onChange={next => {
        setRange({ from: next.from, to: next.to });
        setSiteId(next.siteId);
      }}
    />
  );
}
