"use client";
import { AuditView } from "../../_components/AuditView";
import { useSession } from "../../_lib/session";
import { useLoad } from "../../_lib/use-load";

export default function AuditPage() {
  const { api } = useSession();
  const list = useLoad(() => api.audit(), "audit");
  return <AuditView entries={list.data ?? []} error={list.error} />;
}
