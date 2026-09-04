import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Word-tokenized "contains all words" matcher for client-side search filters.
// Splits the query into words and requires each one to appear somewhere in the
// haystack (case-insensitive), regardless of order or how much whitespace sits
// between them. This is what makes full-name search ("John Smith") reliable --
// a literal substring match breaks the moment word order or spacing is even
// slightly off, which real-world lead data (double spaces, reversed names) hits often.
export function matchesSearch(haystack: string, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const h = haystack.toLowerCase();
  return words.every((w) => h.includes(w));
}

// Payment / contract / job dates (paid_at, closed_at, signed_at, cancelled_at,
// date_added, job_start_date, job_end_date) are stored at UTC midnight, or as bare
// DATE values. `new Date(value).toLocaleDateString()` converts to the viewer's
// timezone first, which renders a day early anywhere west of UTC and can push a
// payment into the wrong month at a boundary. Format the stored calendar date
// directly instead: take the leading YYYY-MM-DD and anchor it at local noon, which
// no timezone offset can drag across a day boundary. Server-side casts in the DB
// views are already correct and must keep going through their own path.
export function fmtStoredDate(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  if (!value) return "";
  const ymd = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-US", opts);
}
