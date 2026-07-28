// Intentionally renders nothing — see app/inbox/layout.tsx. This page only needs
// to exist so /inbox/[emailId] is a valid, deep-linkable route; InboxView reads
// the id straight from the URL via usePathname().
export default function InboxEmailPage() {
  return null;
}
