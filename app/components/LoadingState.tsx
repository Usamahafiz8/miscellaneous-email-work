"use client";

interface LoadingStateProps {
  message?: string;
  count?: number;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full ml-4" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-5/6" />
        <div className="h-3 bg-gray-200 rounded w-4/6" />
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function LoadingState({ message = "Processing emails…", count = 3 }: LoadingStateProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-5 h-5 border-2 border-[#667eea] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">{message}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
