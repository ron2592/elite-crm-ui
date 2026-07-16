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
