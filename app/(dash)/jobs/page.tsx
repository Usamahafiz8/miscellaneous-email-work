// force-dynamic: JobsView reads useSearchParams() directly for ?job=, which
// Next.js otherwise tries to statically prerender this route around.
export const dynamic = "force-dynamic";

import JobsView from "@/app/components/JobsView";

export default function JobsPage() {
  return <JobsView />;
}
