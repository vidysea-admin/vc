"use client";
import { AdminsView } from "../../_components/AdminsView";
import { can } from "../../_lib/permissions";
import { useSession } from "../../_lib/session";
import { useAction, useLoad } from "../../_lib/use-load";

export default function AdminsPage() {
  const { api, role } = useSession();
  const allowed = can(role, "admin.write");
  // Only a super-admin may call GET admins (S3); anyone else gets the denied note without a request.
  const list = useLoad(() => (allowed ? api.listAdmins() : Promise.resolve([])), allowed ? "admins" : "denied");
  const action = useAction();
  if (!role) return null;
  return (
    <AdminsView
      role={role}
      admins={list.data ?? []}
      error={action.error ?? list.error}
      busy={action.busy}
      onCreate={async input => {
        return action.run(async () => {
          await api.createAdmin(input);
          list.reload();
        });
      }}
      onSetRole={async (id, next) => {
        await action.run(async () => {
          await api.setAdminRole(id, next);
          list.reload();
        });
      }}
    />
  );
}
