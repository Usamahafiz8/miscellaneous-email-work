import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import DashboardProvider from "./components/DashboardProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MailAI — Smart Inbox",
  description: "AI-powered email management — summaries, insights, and hiring automation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
