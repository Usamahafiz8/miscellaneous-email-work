"use client";

import { useState, useMemo } from "react";

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  // "block" (default) stacks the chips above a bordered input + Add button —
  // right for a form field. "inline" flows the chips and a borderless input on
  // a single wrapping line, so tags can sit in a detail pane's badge row
  // without adding two rows of height to it.
  variant?: "block" | "inline";
}

export default function TagInput({ value, onChange, placeholder, suggestions, variant = "block" }: TagInputProps) {
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

  // Backspace on an empty input removes the last chip — the standard behaviour
  // for this control, and faster than aiming at a 10px ×.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && input === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  const chips = value.map((tag) => (
    <span key={tag} className="flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium whitespace-nowrap">
      {tag}
      <button
        type="button"
        onClick={() => onChange(value.filter((t) => t !== tag))}
        aria-label={`Remove tag ${tag}`}
        className="hover:text-red-500 leading-none"
      >
        ×
      </button>
    </span>
  ));

  const suggestionList = showSuggestions && filteredSuggestions.length > 0 && (
    <div className="absolute left-0 top-full mt-1 w-full max-w-[240px] bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1 animate-dropdown-in">
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
  );

  if (variant === "inline") {
    return (
      <div className="relative flex flex-wrap items-center gap-1">
        {chips}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : "+ tag"}
          aria-label="Add a tag"
          title="Type a tag and press Enter"
          className="min-w-[70px] flex-1 text-[11px] bg-transparent border-0 border-b border-dashed border-gray-200 px-0.5 py-0.5 focus:outline-none focus:border-violet-400 placeholder:text-gray-400"
        />
        {suggestionList}
      </div>
    );
  }

  return (
    <div>
      {value.length > 0 && <div className="flex gap-1.5 mb-1.5 flex-wrap">{chips}</div>}
      <div className="relative flex gap-1.5">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-[13px] rounded-lg border border-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
        />
        <button
          type="button"
          onClick={() => add()}
          disabled={!input.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
        {suggestionList}
      </div>
    </div>
  );
}
