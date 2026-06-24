"use client";

import { useState } from "react";
import type { ProviderKey, SummaryLength } from "@/lib/types";
import ProviderSelector from "./ProviderSelector";

interface ConfigPanelProps {
  email: string;
  password: string;
  host: string;
  port: number;
  maxEmails: number;
  summaryLength: SummaryLength;
  provider: ProviderKey;
  isTesting: boolean;
  isLoading: boolean;
  onFieldChange: (key: string, value: string | number) => void;
  onProviderChange: (provider: ProviderKey) => void;
  onTestConnection: () => void;
  onFetchAndSummarize: () => void;
}

export default function ConfigPanel({
  email,
  password,
  host,
  port,
  maxEmails,
  summaryLength,
  provider,
  isTesting,
  isLoading,
  onFieldChange,
  onProviderChange,
  onTestConnection,
  onFetchAndSummarize,
}: ConfigPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-semibold text-gray-800">Email Configuration</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-6 pb-6 space-y-5 border-t border-gray-50">
          <div className="pt-4">
            <ProviderSelector value={provider} onChange={onProviderChange} />
          </div>

          {/* Email + Password */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => onFieldChange("email", e.target.value)}
                placeholder="hr@asadullahio"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => onFieldChange("password", e.target.value)}
                  placeholder="App password or IMAP password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Host + Port */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => onFieldChange("host", e.target.value)}
                placeholder="imap.example.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => onFieldChange("port", Number(e.target.value))}
                min={1}
                max={65535}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
            </div>
          </div>

          {/* Options */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Emails <span className="text-gray-400 font-normal">(1–100)</span>
              </label>
              <input
                type="number"
                value={maxEmails}
                onChange={(e) => onFieldChange("maxEmails", Number(e.target.value))}
                min={1}
                max={100}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Summary Length</label>
              <select
                value={summaryLength}
                onChange={(e) => onFieldChange("summaryLength", e.target.value as SummaryLength)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea] bg-white"
              >
                <option value="short">Short (2–3 sentences)</option>
                <option value="medium">Medium (4–5 sentences)</option>
                <option value="long">Long (6–8 sentences)</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTesting || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#667eea] text-[#667eea] text-sm font-medium hover:bg-[#667eea]/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting ? (
                <div className="w-4 h-4 border-2 border-[#667eea] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isTesting ? "Testing…" : "Test Connection"}
            </button>

            <button
              type="button"
              onClick={onFetchAndSummarize}
              disabled={isLoading || isTesting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-sm"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {isLoading ? "Processing…" : "Fetch & Summarize"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
