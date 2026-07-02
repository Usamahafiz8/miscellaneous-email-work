// Intentionally renders nothing — see app/hiring/layout.tsx.
// force-dynamic: HiringView (in the layout) reads useSearchParams() directly for
// ?stage=, which Next.js otherwise tries to statically prerender this route around.
export const dynamic = "force-dynamic";

export default function HiringPage() {
  return null;
}
