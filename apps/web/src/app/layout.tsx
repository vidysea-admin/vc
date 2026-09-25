import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Counsellor approval", description: "Vidysea counselling engine: scribe diff approval (T-008)" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
