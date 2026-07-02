export interface ParsedSearchQuery {
  from?: string;
  subject?: string;
  free?: string;
}

const FIELD_TOKEN_RE = /\b(from|subject):(?:"([^"]*)"|(\S+))/gi;

// Gmail-style field-scoped search operators (e.g. `from:hr@company.com
// subject:"senior developer"`). Repeated same-field tokens: last one wins.
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {};
  const free = raw
    .replace(FIELD_TOKEN_RE, (_match, field: string, quoted?: string, unquoted?: string) => {
      const value = (quoted ?? unquoted ?? "").trim();
      if (value) result[field.toLowerCase() as "from" | "subject"] = value;
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  if (free) result.free = free;
  return result;
}
