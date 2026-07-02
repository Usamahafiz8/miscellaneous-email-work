export interface ParsedSection {
  label: string;
  value: string;
}

// Parses the "§ Label: Value" bullet format the AI uses for attachmentSummary
// (see lib/claude.ts's summarizePdfAttachment/buildBatchPrompt prompts).
// Shared by EmailInsightsPanel (pretty display) and the candidate-profile
// backfill route (structured extraction from already-stored text — no AI call).
export function parseSections(text: string): ParsedSection[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];
  for (const line of lines) {
    const match = line.match(/^§\s*(.+?):\s*(.+)$/);
    if (match) sections.push({ label: match[1].trim(), value: match[2].trim() });
  }
  return sections.length >= 2 ? sections : null;
}
