// Intentionally renders nothing — the actual view lives in layout.tsx (InboxView),
// which derives the open email (if any) from the URL itself. This page only needs
// to exist so /inbox is a valid route.
export default function InboxPage() {
  return null;
}
