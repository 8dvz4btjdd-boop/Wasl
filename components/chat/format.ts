// Locale-aware formatting through Intl, so times, durations and language names need no strings.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 min ago" / "قبل 3 د", "yesterday" / "أمس", then a short date. */
export function formatRelative(iso: string, now: number, locale: string): string {
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  if (abs < MINUTE) return rtf.format(0, "second");
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < 2 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
}

/** A span as minutes or hours: "6 min" / "6 دقائق" (long) or "6m" / "6 د" (narrow). */
export function formatDuration(ms: number, locale: string, display: "long" | "narrow" = "long"): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  const unit = minutes < 60 ? "minute" : "hour";
  const value = minutes < 60 ? minutes : Math.round(minutes / 60);
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: display }).format(value);
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** "Today" / "اليوم", "Yesterday" / "أمس", else a full date. For day separators. */
export function formatDay(iso: string, now: number, locale: string): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(Date.parse(iso)) - startOf(now)) / DAY);
  if (days === 0 || days === -1) {
    const label = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** First visible character, for avatar initials (handles Arabic and emoji). */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}
