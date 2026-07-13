"use client";

// Lightweight placeholder shown while an email/candidate's AI summary or full
// body is being fetched — used in place of a bare spinner so the detail panel
// feels like content is materializing rather than just waiting.
export default function DetailLoadingSkeleton({ message }: { message: string }) {
  return (
    <div className="py-2">
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
      <p className="text-xs text-gray-400 text-center mt-5">{message}</p>
    </div>
  );
}
