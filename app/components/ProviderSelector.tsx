"use client";

import { IMAP_PROVIDERS, type ProviderKey } from "@/lib/types";

interface ProviderSelectorProps {
  value: ProviderKey;
  onChange: (provider: ProviderKey) => void;
}

const LABELS: Record<ProviderKey, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Hotmail",
  custom: "Custom IMAP",
};

export default function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Email Provider</label>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(IMAP_PROVIDERS) as ProviderKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
              value === key
                ? "border-[#667eea] bg-[#667eea]/10 text-[#667eea]"
                : "border-gray-200 bg-white text-gray-600 hover:border-[#667eea]/50"
            }`}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
      {IMAP_PROVIDERS[value].note && (
        <p className="mt-1.5 text-xs text-gray-500">{IMAP_PROVIDERS[value].note}</p>
      )}
    </div>
  );
}
