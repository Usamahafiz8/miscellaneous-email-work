"use client";

import InboxView from "@/app/components/InboxView";

// A layout, not a page — Next.js keeps layouts mounted across nested route
// changes, unlike the optional catch-all page.tsx this used to be (which was
// torn down and rebuilt every time the URL moved between /inbox and
// /inbox/[emailId], resetting all list state and forcing a full refetch on
// every row open/close). InboxView now derives the selected id itself from
// the URL (see usePathname() inside it), so `children` here is unused.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InboxView />
      {children}
    </>
  );
}
