export interface ParsedSection {
  label: string;
  value: string;
}

// Keep in sync with the section labels requested in lib/claude.ts's
// summarizePdfAttachment/buildBatchPrompt prompts and EmailInsightsPanel's SECTION_CONFIG.
export const KNOWN_SECTION_LABELS = [
  "Document Type",
  "Name",
  "Current Role",
  "Total Experience",
  "Work History",
  "Technologies & Skills",
  "Education",
  "Key Achievements",
  "Other Details",
];

const LABEL_LINE = new RegExp(
  `^(${KNOWN_SECTION_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}):\\s*(.+)$`
);

// Parses the "Label: Value" line format the AI uses for attachmentSummary
// (see lib/claude.ts's summarizePdfAttachment/buildBatchPrompt prompts).
// Shared by EmailInsightsPanel (pretty display) and the candidate-profile
// backfill route (structured extraction from already-stored text — no AI call).
export function parseSections(text: string): ParsedSection[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];
  for (const line of lines) {
    const match = line.match(LABEL_LINE);
    if (match) sections.push({ label: match[1].trim(), value: match[2].trim() });
  }
  return sections.length >= 2 ? sections : null;
}
