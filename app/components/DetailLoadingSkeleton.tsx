"use client";

// Lightweight placeholder shown while an email/candidate's AI summary or full
// body is being fetched — used in place of a bare spinner so the detail panel
// feels like content is materializing rather than just waiting.
export default function DetailLoadingSkeleton({ message }: { message: string }) {
  return (
    <div className="py-2">
      <div className="space-y-3">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
      </div>
      <p className="text-xs text-gray-400 text-center mt-5">{message}</p>
    </div>
  );
}
