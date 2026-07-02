"use client";

import { useState, useEffect, useRef } from "react";
import type { EmailAttachment } from "@/lib/types";

export default function PdfViewer({ attachment }: { attachment: EmailAttachment }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const bytes = Uint8Array.from(atob(attachment.data), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    prevUrl.current = url;
    return () => URL.revokeObjectURL(url);
  }, [attachment.data]);

  if (!blobUrl) return null;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 truncate">{attachment.filename}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">({(attachment.size / 1024).toFixed(0)} KB)</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {/* Inline preview relies on <embed>, which many mobile browsers and
              in-app webviews don't support — this link always works as a fallback. */}
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in new tab
          </a>
          <a
            href={blobUrl}
            download={attachment.filename}
            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
        </div>
      </div>
      <embed src={blobUrl} type="application/pdf" className="w-full" style={{ height: "460px" }} />
    </div>
  );
}
