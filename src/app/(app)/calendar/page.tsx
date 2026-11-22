import type { Metadata } from "next";
import { MeetingCalendar } from "@/components/meetings/meeting-calendar";
import { getOrganization } from "@/server/queries";
import { requireActive } from "@/server/session";
import { getMeetingForActor, listMeetingPeople, listMeetings } from "@/server/services/meetings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meetings & Calendar" };

function currentMonthInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function parseMonthParts(month: string): { year: number; monthNumber: number } {
  const [yearText = "", monthText = ""] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    const now = new Date();
    return { year: now.getUTCFullYear(), monthNumber: now.getUTCMonth() + 1 };
  }
  return { year, monthNumber };
}

function monthRange(month: string) {
  const { year, monthNumber } = parseMonthParts(month);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(Date.UTC(year, monthNumber - 1, 1 - ((first.getUTCDay() + 6) % 7) - 2));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 46);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; meetingId?: string }> }) {
  const { actor } = await requireActive();
  const organization = await getOrganization();
  const timeZone = organization?.timezone ?? "Asia/Kolkata";
  const params = await searchParams;
  const requested = params.month;
  const focusMeeting = params.meetingId ? await getMeetingForActor(actor, params.meetingId) : null;
  const focusMonth = focusMeeting ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date(focusMeeting.startAt)).slice(0, 7) : undefined;
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : focusMonth ?? currentMonthInZone(timeZone);
  const range = monthRange(month);
  const [meetings, people] = await Promise.all([
    listMeetings(actor, range.from, range.to),
    listMeetingPeople(actor),
  ]);
  const nowAt = new Date().toISOString();
  return <MeetingCalendar key={`${month}:${focusMeeting?.id ?? ""}`} nowAt={nowAt} meetings={meetings} people={people} timeZone={timeZone} currentUid={actor.uid} isAdmin={actor.role === "admin"} month={month} focusMeetingId={focusMeeting?.id} />;
}
