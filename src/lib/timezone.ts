/** Date-only task deadlines are stored as an instant at 23:59:59 in the organisation timezone. */
function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return timeZone;
  } catch {
    return "Asia/Kolkata";
  }
}

function partsFor(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function dateTimeInputInTimeZone(value: string | undefined, timeZone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsFor(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function dateTimeToIso(localValue: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day || hour > 23 || minute > 59) return null;

  const zone = safeTimeZone(timeZone);
  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetWallClock;
  // Reconcile the UTC guess with the wall clock in the requested zone. Iteration
  // handles UTC offsets and daylight-saving changes without relying on the browser zone.
  for (let i = 0; i < 4; i++) {
    const p = partsFor(new Date(guess), zone);
    const representedAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const correction = targetWallClock - representedAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  const resolved = partsFor(new Date(guess), zone);
  if (Number(resolved.year) !== year || Number(resolved.month) !== month || Number(resolved.day) !== day || Number(resolved.hour) !== hour || Number(resolved.minute) !== minute) {
    return null; // Reject a local time skipped by a daylight-saving transition.
  }
  return new Date(guess).toISOString();
}

export function formatDateInTimeZone(value: string | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: safeTimeZone(timeZone), day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

export function formatDateTimeInTimeZone(value: string | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: safeTimeZone(timeZone), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
