"use client";

import HiringView from "@/app/components/HiringView";

// A layout, not a page — see app/inbox/layout.tsx for the full rationale.
// Keeps HiringView mounted across /hiring <-> /hiring/[emailId] navigations
// instead of resetting all list/filter state and refetching on every click.
export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HiringView />
      {children}
    </>
  );
}
