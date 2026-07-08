import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MailAI — Smart Inbox",
  description: "AI-powered email management — summaries, insights, and hiring automation",
};

// Root layout is intentionally chrome-free — the authenticated dashboard shell
// (TopBar + DashboardProvider) lives in app/(dash)/layout.tsx so that /login can
// render on its own without the sidebar/provider (which require a session).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
