"use client";

import { useState, useMemo } from "react";

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}

export default function TagInput({ value, onChange, placeholder, suggestions }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const add = (raw?: string) => {
    const v = (raw ?? input).trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
    setShowSuggestions(false);
  };

  const filteredSuggestions = useMemo(() => {
    if (!suggestions?.length || !input.trim()) return [];
    const q = input.trim().toLowerCase();
    return suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, input, value]);

  return (
    <div>
      <div className="flex gap-2 mb-2 flex-wrap">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded-full px-2.5 py-1 font-medium">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`} className="hover:text-red-500 ml-0.5 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="relative flex gap-2">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
        />
        <button type="button" onClick={() => add()} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 transition-colors">Add</button>

        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute left-0 top-full mt-1 w-full max-w-[240px] bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); add(s); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
