import { createHash } from "node:crypto";

export function notificationDigestDocumentId(organizationId: string, recipientUserId: string, localDate: string): string {
  return createHash("sha256").update([organizationId, recipientUserId, localDate].join("\u0000")).digest("hex");
}

export function notificationDigestItemDocumentId(eventId: string, recipientKey: string): string {
  const recipientHash = createHash("sha256").update(recipientKey).digest("hex").slice(0, 16);
  return `${eventId}_${recipientHash}_digest`;
}

export function localDateParts(instant: Date, timeZone: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function dailyDigestScheduledAt(localDate: string, timeZone: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const desiredUtc = Date.UTC(year!, month! - 1, day!, 9, 0, 0);
  let guess = desiredUtc;
  for (let index = 0; index < 4; index++) {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(p.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const correction = desiredUtc - represented;
    if (!correction) break;
    guess += correction;
  }
  return new Date(guess).toISOString();
}

export function isDigestScheduleDue(now: Date, timeZone: string): boolean {
  return localDateParts(now, timeZone).hour >= 9;
}
