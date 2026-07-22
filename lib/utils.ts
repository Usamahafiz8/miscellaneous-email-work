export function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

export function formatFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

export function parseSender(from: string): { name: string; email: string; initials: string } {
  const email = from.includes("<")
    ? from.slice(from.indexOf("<") + 1, from.lastIndexOf(">"))
    : from.includes("@") ? from : "";
  const name = from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || email || from;
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, email, initials };
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-indigo-500",
];
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600", "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600", "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600", "from-cyan-500 to-sky-600",
];

function strHash(str: string): number {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return h >>> 0;
}

export function avatarColor(str: string): string {
  return AVATAR_COLORS[strHash(str) % AVATAR_COLORS.length];
}

export function avatarGradient(str: string): string {
  return AVATAR_GRADIENTS[strHash(str) % AVATAR_GRADIENTS.length];
}
