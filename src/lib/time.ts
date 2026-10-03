export const TIME_ZONE = "Europe/Warsaw";

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const displayFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function warsawParts(at: Date): Record<string, string> {
  return Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, x.value]));
}

/** Offset of Warsaw wall-clock time from UTC at the given instant, in milliseconds. */
function offsetMs(at: Date): number {
  const p = warsawParts(at);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}

/** Formats an instant as Warsaw wall-clock time in the `YYYY-MM-DDTHH:mm` shape. */
function toWarsawLocal(at: Date): string {
  const p = warsawParts(at);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Converts Warsaw wall-clock time (`YYYY-MM-DDTHH:mm`, as sent by `<input type="datetime-local">`)
 * into a UTC instant, independent of the runtime's time zone.
 * Returns `null` for a malformed value, a nonexistent calendar date, a wall-clock time skipped
 * by the DST change, or an ambiguous one repeated by the DST change.
 */
export function warsawLocalToUtc(local: string): Date | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const asUtc = new Date(guess);
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day ||
    asUtc.getUTCHours() !== hour ||
    asUtc.getUTCMinutes() !== minute
  ) {
    return null;
  }

  let utc = guess - offsetMs(new Date(guess));
  utc = guess - offsetMs(new Date(utc));
  const result = new Date(utc);

  // Skipped hour (spring forward): the result formats back to a different wall-clock time.
  if (toWarsawLocal(result) !== local) return null;

  // Repeated hour (fall back): two distinct instants map to the same wall-clock time.
  const threeHoursMs = 3 * 60 * 60 * 1000;
  const before = guess - offsetMs(new Date(guess - threeHoursMs));
  const after = guess - offsetMs(new Date(guess + threeHoursMs));
  if (before !== after && toWarsawLocal(new Date(before)) === local && toWarsawLocal(new Date(after)) === local) {
    return null;
  }

  return result;
}

/** Formats an ISO instant as Warsaw date and time, e.g. `10.10.2026, 20:45`. */
export function formatWarsaw(iso: string): string {
  return displayFormatter.format(new Date(iso));
}
