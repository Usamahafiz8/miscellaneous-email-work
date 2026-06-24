"use client";

import { useState, useCallback } from "react";
import type {
  EmailSummary,
  ProcessEmailsRequest,
  ProviderKey,
  SummaryLength,
} from "@/lib/types";
import { IMAP_PROVIDERS } from "@/lib/types";

interface FormState {
  provider: ProviderKey;
  email: string;
  password: string;
  host: string;
  port: number;
  maxEmails: number;
  summaryLength: SummaryLength;
}

interface UseEmailSummarizerReturn {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setProvider: (provider: ProviderKey) => void;
  summaries: EmailSummary[];
  isLoading: boolean;
  isTesting: boolean;
  error: string | null;
  successMessage: string | null;
  dismissError: () => void;
  testConnection: () => Promise<void>;
  fetchAndSummarize: () => Promise<void>;
  clearResults: () => void;
}

const DEFAULT_FORM: FormState = {
  provider: "custom",
  email: "",
  password: "",
  host: "",
  port: 993,
  maxEmails: 10,
  summaryLength: "medium",
};

export function useEmailSummarizer(): UseEmailSummarizerReturn {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [summaries, setSummaries] = useState<EmailSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setProvider = useCallback((provider: ProviderKey) => {
    const preset = IMAP_PROVIDERS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      host: preset.host || prev.host,
      port: preset.port,
    }));
  }, []);

  const testConnection = useCallback(async () => {
    setIsTesting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          host: form.host,
          port: form.port,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Connection failed");
      }
      setSuccessMessage("Connection successful! Your IMAP settings are working.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setIsTesting(false);
    }
  }, [form]);

  const fetchAndSummarize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload: ProcessEmailsRequest = {
        email: form.email,
        password: form.password,
        host: form.host,
        port: form.port,
        maxEmails: form.maxEmails,
        summaryLength: form.summaryLength,
      };
      const res = await fetch("/api/email/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to process emails");
      }
      setSummaries(data.summaries ?? []);
      const count = data.emailCount ?? data.summaries?.length ?? 0;
      setSuccessMessage(`Successfully summarized ${count} email${count !== 1 ? "s" : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [form]);

  const clearResults = useCallback(() => {
    setSummaries([]);
    setSuccessMessage(null);
    setError(null);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    form,
    setField,
    setProvider,
    summaries,
    isLoading,
    isTesting,
    error,
    successMessage,
    dismissError,
    testConnection,
    fetchAndSummarize,
    clearResults,
  };
}
