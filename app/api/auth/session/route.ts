import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/session";

// GET /api/auth/session — lightweight "who am I" check for the client.
export async function GET() {
  const email = currentAccount();
  return NextResponse.json({ authenticated: !!email, email });
}
