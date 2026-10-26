import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./admin.css";
import { SessionProvider } from "./_lib/session";

export const metadata: Metadata = { title: "Virtual Counsellor admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm-root">
      <SessionProvider>{children}</SessionProvider>
    </div>
  );
}
