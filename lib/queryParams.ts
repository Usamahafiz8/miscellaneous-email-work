import { CATEGORIES, PRIORITIES, STATUSES, STAGES } from "./types";
import type { EmailListQuery, Category, Priority, EmailStatus, ActionRequired, SortField, Stage } from "./types";

const VALID_SORT_FIELDS: SortField[] = ["date", "priorityRank", "status", "category", "from", "subject"];
const VALID_ACTION_REQUIRED: ActionRequired[] = ["Yes", "No"];
const MAX_TAGS_FILTER = 20; // defensive cap — tags are free text, can't be whitelisted like an enum

// Shared by every list-fetching API route so the filter/sort/page contract stays
// identical everywhere. Whitelists every enum value against the type unions —
// nothing from the query string reaches Prisma's `where`/`orderBy` unchecked.
export function parseEmailListQuery(searchParams: URLSearchParams): EmailListQuery {
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(Math.max(1, Number(searchParams.get("pageSize")) || 50), 500);
  const search = searchParams.get("search")?.trim() || undefined;

  const category = searchParams.getAll("category").filter((c): c is Category => (CATEGORIES as string[]).includes(c));
  const priority = searchParams.getAll("priority").filter((p): p is Priority => (PRIORITIES as string[]).includes(p));
  const status = searchParams.getAll("status").filter((s): s is EmailStatus => (STATUSES as string[]).includes(s));
  const actionRequired = searchParams.getAll("actionRequired").filter((a): a is ActionRequired => (VALID_ACTION_REQUIRED as string[]).includes(a));
  const stage = searchParams.getAll("stage").filter((s): s is Stage => (STAGES as string[]).includes(s));
  const tags = Array.from(new Set(searchParams.getAll("tag").map((t) => t.trim()).filter(Boolean))).slice(0, MAX_TAGS_FILTER);
  const skills = Array.from(new Set(searchParams.getAll("skill").map((s) => s.trim()).filter(Boolean))).slice(0, MAX_TAGS_FILTER);

  const dateFromRaw = searchParams.get("dateFrom");
  const dateFrom = dateFromRaw && !isNaN(Date.parse(dateFromRaw)) ? dateFromRaw : undefined;
  const dateToRaw = searchParams.get("dateTo");
  const dateTo = dateToRaw && !isNaN(Date.parse(dateToRaw)) ? dateToRaw : undefined;
  const keywords = searchParams.get("keywords")?.trim() || undefined;

  const sortByRaw = searchParams.get("sortBy");
  const sortBy = VALID_SORT_FIELDS.includes(sortByRaw as SortField) ? (sortByRaw as SortField) : undefined;
  const sortOrderRaw = searchParams.get("sortOrder");
  const sortOrder = sortOrderRaw === "asc" || sortOrderRaw === "desc" ? sortOrderRaw : undefined;

  return {
    page,
    pageSize,
    search,
    keywords,
    category: category.length ? category : undefined,
    priority: priority.length ? priority : undefined,
    status: status.length ? status : undefined,
    actionRequired: actionRequired.length ? actionRequired : undefined,
    stage: stage.length ? stage : undefined,
    tags: tags.length ? tags : undefined,
    skills: skills.length ? skills : undefined,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  };
}
