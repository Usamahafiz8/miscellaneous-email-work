import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// POST /api/auth/logout — clears the session cookie.
export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ success: true });
}
