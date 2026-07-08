import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardProvider from "@/app/components/DashboardProvider";

// Server-side auth guard for the whole authenticated app. Every page under
// (dash) requires a valid session cookie; without one we bounce to /login
// before any dashboard data is fetched. The signed-in email is handed to the
// provider so the UI (TopBar, etc.) can show who's logged in.
export default function DashLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");

  return (
    <DashboardProvider accountEmail={session.email.toLowerCase()}>
      {children}
    </DashboardProvider>
  );
}
