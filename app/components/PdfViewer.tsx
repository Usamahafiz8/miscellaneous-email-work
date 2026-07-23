"use client";

import { useState, useEffect, useRef } from "react";
import type { EmailAttachment } from "@/lib/types";

interface PdfViewerProps {
  attachment: EmailAttachment;
  // Stretch to fill the parent's remaining height instead of a fixed 460px.
  // Used when this is the only attachment in a reading pane — for a hiring
  // application the résumé is the main artifact, so it should get the space
  // rather than sit in a short box under a three-line covering email.
  fill?: boolean;
}

export default function PdfViewer({ attachment, fill = false }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    // A malformed/empty base64 blob makes atob throw. That must not take the
    // whole reading pane down with it — the pane renders the email body and
    // its attachments together now, so one bad attachment would blank the
    // insights too. Degrade to a "couldn't load" card instead.
    try {
      const bytes = Uint8Array.from(atob(attachment.data ?? ""), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setFailed(false);
      prevUrl.current = url;
      return () => URL.revokeObjectURL(url);
    } catch {
      setBlobUrl(null);
      setFailed(true);
    }
  }, [attachment.data]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
        </svg>
        <span className="text-xs text-gray-600 truncate">{attachment.filename}</span>
        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">Couldn&rsquo;t load preview</span>
      </div>
    );
  }

  if (!blobUrl) return null;

  return (
    <div className={`rounded-xl border border-gray-200 overflow-hidden ${fill ? "flex-1 min-h-0 flex flex-col" : ""}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex-shrink-0">
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
      <embed
        src={blobUrl}
        type="application/pdf"
        className={fill ? "w-full flex-1 min-h-0 block" : "w-full block"}
        style={fill ? undefined : { height: "460px" }}
      />
    </div>
  );
}
