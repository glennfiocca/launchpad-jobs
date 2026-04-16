// Helper utilities for the chat-style EmailThread component

/**
 * Extracts a display name from an RFC 5322 "From" header value.
 * e.g. "Jane Smith <jane@example.com>" → "Jane Smith"
 *      "jane@example.com"              → "jane@example.com"
 */
export function senderDisplayName(from: string): string {
  const match = from.match(/^([^<]+)<[^>]+>$/);
  if (match) return match[1].trim();
  return from.trim();
}

/**
 * Returns a human-readable time string:
 * - Today    → "10:34 AM"
 * - Otherwise → "Apr 5 · 10:34 AM"
 */
export function messageTime(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return time;

  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}
