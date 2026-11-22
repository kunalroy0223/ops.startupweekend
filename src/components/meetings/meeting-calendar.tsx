"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Link2, MapPin, Plus, Users } from "lucide-react";
import type { Meeting, MeetingResponse } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { FormError, useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api";
import { dateTimeInputInTimeZone, dateTimeToIso } from "@/lib/timezone";

type Person = { uid: string; displayName: string; role: string };
type FormState = { title: string; description: string; startAt: string; endAt: string; location: string; meetingUrl: string; attendeeUserIds: string[] };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function dateKey(iso: string, tz: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
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
function shiftMonth(month: string, amount: number) {
  const { year, monthNumber } = parseMonthParts(month);
  const d = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function calendarDays(month: string) {
  const { year, monthNumber } = parseMonthParts(month);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(Date.UTC(year, monthNumber - 1, 1 - ((first.getUTCDay() + 6) % 7)));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
function blankForm(day: string, tz: string): FormState {
  const start = dateTimeToIso(`${day}T10:00`, tz) ?? "";
  const end = dateTimeToIso(`${day}T10:30`, tz) ?? "";
  return { title: "", description: "", startAt: dateTimeInputInTimeZone(start, tz), endAt: dateTimeInputInTimeZone(end, tz), location: "", meetingUrl: "", attendeeUserIds: [] };
}

function formatAgendaDate(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return day;
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const weekdayName = WEEKDAY_NAMES[date.getUTCDay()] ?? "Sunday";
  const monthName = MONTH_NAMES[month - 1] ?? "January";
  return `${weekdayName} ${dayOfMonth} ${monthName}, ${year}`;
}

function timePartsInZone(value: string | undefined, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const result = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
  return Object.values(result).every(Number.isFinite) && result.month >= 1 && result.month <= 12
    ? result
    : null;
}

function formatMeetingTime(value: string | undefined, timeZone: string): string {
  const parts = timePartsInZone(value, timeZone);
  if (!parts) return "—";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${parts.hour >= 12 ? "PM" : "AM"}`;
}

function formatMeetingDateTime(value: string | undefined, timeZone: string): string {
  const parts = timePartsInZone(value, timeZone);
  if (!parts) return "—";
  const monthName = MONTH_NAMES[parts.month - 1] ?? "Jan";
  return `${parts.day} ${monthName.slice(0, 3)} ${parts.year}, ${formatMeetingTime(value, timeZone)}`;
}

export function MeetingCalendar({ meetings, people, timeZone, currentUid, isAdmin, month, nowAt, focusMeetingId }: {
  meetings: Meeting[]; people: Person[]; timeZone: string; currentUid: string; isAdmin: boolean; month: string; nowAt: string; focusMeetingId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = dateKey(nowAt, timeZone);
  const dates = useMemo(() => calendarDays(month), [month]);
  const focusMeeting = focusMeetingId ? meetings.find((meeting) => meeting.id === focusMeetingId) : undefined;
  const [selectedDay, setSelectedDay] = useState(focusMeeting ? dateKey(focusMeeting.startAt, timeZone) : today.startsWith(month) ? today : `${month}-01`);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<FormState>(() => blankForm(today.startsWith(month) ? today : `${month}-01`, timeZone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    meetings.forEach((meeting) => {
      const key = dateKey(meeting.startAt, timeZone);
      if (key) map.set(key, [...(map.get(key) ?? []), meeting]);
    });
    map.forEach((items) => items.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [meetings, timeZone]);
  const selectedMeetings = byDate.get(selectedDay) ?? [];
  const personNames = useMemo(() => new Map(people.map((person) => [person.uid, person.displayName])), [people]);
  const nowMs = Date.parse(nowAt);
  const upcoming = meetings.filter((meeting) => meeting.status === "scheduled" && Date.parse(meeting.startAt) >= nowMs).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 6);
  const { year: monthYear, monthNumber } = parseMonthParts(month);
  const monthLabel = `${MONTH_NAMES[monthNumber - 1] ?? "January"} ${monthYear}`;

  function openCreate(day = selectedDay) {
    setEditing(null); setForm(blankForm(day, timeZone)); setError(null); setOpen(true);
  }
  function openEdit(meeting: Meeting) {
    setEditing(meeting);
    setForm({ title: meeting.title, description: meeting.description ?? "", startAt: dateTimeInputInTimeZone(meeting.startAt, timeZone), endAt: dateTimeInputInTimeZone(meeting.endAt, timeZone), location: meeting.location ?? "", meetingUrl: meeting.meetingUrl ?? "", attendeeUserIds: meeting.attendeeUserIds.filter((uid) => uid !== meeting.organizerUserId) });
    setError(null); setOpen(true);
  }
  async function save() {
    setBusy(true); setError(null);
    const startAt = dateTimeToIso(form.startAt, timeZone);
    const endAt = dateTimeToIso(form.endAt, timeZone);
    if (!startAt || !endAt) { setError("Choose valid start and end times in the organisation timezone."); setBusy(false); return; }
    try {
      const body = { ...form, startAt, endAt, description: form.description || undefined, location: form.location || undefined, meetingUrl: form.meetingUrl || undefined };
      if (editing) await api(`/api/meetings/${editing.id}`, { method: "PATCH", body });
      else await api("/api/meetings", { body });
      toast({ tone: "success", message: editing ? "Meeting updated." : "Meeting scheduled." });
      setOpen(false); setEditing(null); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Could not save the meeting."); }
    finally { setBusy(false); }
  }
  async function respond(meeting: Meeting, response: MeetingResponse) {
    setBusy(true);
    try { await api(`/api/meetings/${meeting.id}/rsvp`, { body: { response } }); toast({ tone: "success", message: `Response saved: ${response}.` }); router.refresh(); }
    catch (err) { toast({ tone: "danger", message: err instanceof ApiClientError ? err.message : "Could not save your response." }); }
    finally { setBusy(false); }
  }
  async function cancelMeeting() {
    if (!cancelTarget) return;
    setBusy(true);
    try { await api(`/api/meetings/${cancelTarget.id}/cancel`, { body: {} }); toast({ tone: "success", message: "Meeting cancelled." }); setCancelTarget(null); router.refresh(); }
    catch (err) { toast({ tone: "danger", message: err instanceof ApiClientError ? err.message : "Could not cancel the meeting." }); }
    finally { setBusy(false); }
  }
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return <div className="grid min-w-0 gap-6">
    <PageHeader eyebrow="MODULE 8 · MEETINGS & CALENDAR" title="Meetings & Calendar" description="Schedule conversations, coordinate attendees and keep team dates in one shared calendar." icon={<CalendarDays />} actions={<Button icon={<Plus className="size-4" />} onClick={() => openCreate()}>Schedule meeting</Button>} />
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
      <Panel className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><SectionHeading title={monthLabel} count={meetings.length} /><p className="text-[11px] text-fg-3">Times shown in {timeZone}</p></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => router.push(`/calendar?month=${shiftMonth(month, -1)}`)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => router.push(`/calendar?month=${today.slice(0, 7)}`)}>Today</Button><Button size="sm" variant="ghost" aria-label="Next month" onClick={() => router.push(`/calendar?month=${shiftMonth(month, 1)}`)}><ChevronRight className="size-4" /></Button></div></div>
        <div className="grid grid-cols-7 gap-1">{dayLabels.map((day) => <div key={day} className="py-2 text-center font-mono text-[10px] uppercase text-fg-3">{day}</div>)}{dates.map((date) => {
          const items = byDate.get(date) ?? []; const inMonth = date.startsWith(month); const active = date === selectedDay;
          return <button key={date} type="button" aria-pressed={active} onClick={() => setSelectedDay(date)} className={`flex min-h-[72px] min-w-0 flex-col items-start rounded-lg border p-1.5 text-left sm:min-h-[92px] sm:p-2 ${active ? "border-accent bg-accent-soft" : "border-line hover:bg-muted"} ${inMonth ? "" : "opacity-45"}`}><span className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular ${date === today ? "bg-inverse text-fg-inverse" : ""}`}>{Number(date.slice(-2))}</span><span className="mt-1 grid w-full min-w-0 gap-1">{items.slice(0, 2).map((meeting) => <span key={meeting.id} className={`block min-w-0 truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] ${meeting.status === "cancelled" ? "bg-muted text-fg-3 line-through" : "bg-info/10 text-info"}`}>{meeting.title}</span>)}{items.length > 2 ? <span className="text-[9px] text-fg-3">+{items.length - 2} more</span> : null}</span></button>;
        })}</div>
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-fg-3"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-info" />Scheduled</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted" />Cancelled</span></div>
      </Panel>
      <Panel className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="eyebrow">Agenda</p><h2 className="display mt-1 text-xl">{formatAgendaDate(selectedDay)}</h2></div><Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => openCreate(selectedDay)}>Add</Button></div>
        {selectedMeetings.length ? <div className="grid gap-3">{selectedMeetings.map((meeting) => {
          const isOrganizer = meeting.organizerUserId === currentUid; const canManage = isAdmin || isOrganizer; const canRespond = !isOrganizer && meeting.attendeeUserIds.includes(currentUid); const response = meeting.responses?.[currentUid];
          return <article key={meeting.id} className="min-w-0 rounded-xl border border-line bg-canvas p-3">
            <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold leading-snug">{meeting.title}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-fg-2"><Clock3 className="size-3.5" />{formatMeetingDateTime(meeting.startAt, timeZone)} – {formatMeetingTime(meeting.endAt, timeZone)}</p></div>{meeting.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Scheduled</Badge>}</div>
            {meeting.description ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-fg-2">{meeting.description}</p> : null}
            {meeting.location ? <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-2"><MapPin className="size-3.5 shrink-0" />{meeting.location}</p> : null}
            {meeting.meetingUrl ? <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 break-all text-xs font-semibold text-accent-text underline underline-offset-4"><Link2 className="size-3.5 shrink-0" />Join meeting</a> : null}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-3"><Users className="size-3.5" />{meeting.attendeeUserIds.length} attendees · organised by {personNames.get(meeting.organizerUserId) ?? "Inhub member"}</p>
            {canManage ? <p className="mt-1 text-[10px] text-fg-3">RSVPs · {meeting.attendeeUserIds.filter((uid) => meeting.responses?.[uid] === "accepted").length} accepted · {meeting.attendeeUserIds.filter((uid) => meeting.responses?.[uid] === "tentative").length} tentative · {meeting.attendeeUserIds.filter((uid) => meeting.responses?.[uid] === "declined").length} declined · {meeting.attendeeUserIds.filter((uid) => !meeting.responses?.[uid]).length} pending</p> : null}
            {meeting.status === "scheduled" && canRespond ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-[11px] text-fg-3">Your response: {response ?? "pending"}</span>{(["accepted", "tentative", "declined"] as const).map((value) => <Button key={value} size="sm" variant={response === value ? "primary" : "ghost"} disabled={busy} onClick={() => respond(meeting, value)}>{value[0]!.toUpperCase() + value.slice(1)}</Button>)}</div> : null}
            {meeting.status === "scheduled" && canManage ? <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"><Button size="sm" variant="secondary" onClick={() => openEdit(meeting)}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancelTarget(meeting)}>Cancel meeting</Button></div> : null}
          </article>;
        })}</div> : <EmptyState compact icon={<CalendarDays />} title="Nothing scheduled">Meetings on this date will appear here. Schedule a meeting to get started.</EmptyState>}
      </Panel>
    </div>
    <Panel className="min-w-0"><SectionHeading title="Upcoming meetings" count={upcoming.length} />{upcoming.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{upcoming.map((meeting) => <button key={meeting.id} type="button" onClick={() => setSelectedDay(dateKey(meeting.startAt, timeZone))} className="min-w-0 rounded-lg border border-line p-3 text-left hover:bg-muted"><p className="truncate text-sm font-semibold">{meeting.title}</p><p className="mt-1 text-xs text-fg-2">{formatMeetingDateTime(meeting.startAt, timeZone)}</p><p className="mt-1 text-[10px] text-fg-3">{meeting.attendeeUserIds.length} attendees</p></button>)}</div> : <p className="text-xs text-fg-2">No upcoming meetings in this month.</p>}</Panel>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title={editing ? "Edit meeting" : "Schedule a meeting"} description={`Times use the organisation timezone (${timeZone}). Attendees must be active people within your permitted scope.`} size="lg" footer={<><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={save}>{editing ? "Save changes" : "Schedule meeting"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meeting title" required>{(p) => <Input {...p} value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Weekly planning" />}</Field>
        <Field label="Location" hint="A room or venue; alternatively provide a meeting link.">{(p) => <Input {...p} value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Conference room" />}</Field>
        <Field label={`Starts (${timeZone})`} required>{(p) => <Input {...p} type="datetime-local" value={form.startAt} onChange={(e) => setField("startAt", e.target.value)} />}</Field>
        <Field label={`Ends (${timeZone})`} required>{(p) => <Input {...p} type="datetime-local" value={form.endAt} onChange={(e) => setField("endAt", e.target.value)} />}</Field>
        <Field label="Meeting link" hint="Optional. Use an http or https URL.">{(p) => <Input {...p} type="url" value={form.meetingUrl} onChange={(e) => setField("meetingUrl", e.target.value)} placeholder="https://meet.google.com/…" />}</Field>
        <Field label="Description" className="sm:col-span-2">{(p) => <Textarea {...p} rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Agenda, preparation or notes for attendees" />}</Field>
        <div className="sm:col-span-2"><p className="mb-2 text-[13px] font-semibold">Invite people</p><div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">{people.filter((person) => person.uid !== (editing?.organizerUserId ?? currentUid)).length ? people.filter((person) => person.uid !== (editing?.organizerUserId ?? currentUid)).map((person) => <label key={person.uid} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"><input type="checkbox" disabled={!form.attendeeUserIds.includes(person.uid) && form.attendeeUserIds.length >= 29} checked={form.attendeeUserIds.includes(person.uid)} onChange={(e) => setField("attendeeUserIds", e.target.checked ? [...form.attendeeUserIds, person.uid] : form.attendeeUserIds.filter((uid) => uid !== person.uid))} /><span className="min-w-0 truncate">{person.displayName}</span><span className="ml-auto shrink-0 text-fg-3">{person.role}</span></label>) : <p className="px-2 py-3 text-xs text-fg-3 sm:col-span-2">{isAdmin ? "No other active accounts were found in this organisation." : "No active people share your assigned team or workstream scope. Ask an Admin to check your team assignments if you need to invite someone."}</p>}</div><p className="mt-1 text-[10px] text-fg-3">The organiser is included automatically. {form.attendeeUserIds.length + 1} selected including the organiser.</p>{editing && form.attendeeUserIds.some((uid) => !people.some((person) => person.uid === uid)) ? <p className="mt-1 text-[10px] text-fg-3">Some existing attendees are outside the directory list available to you; they will remain invited.</p> : null}</div>
        <div className="sm:col-span-2"><FormError message={error} /></div>
      </div>
    </Dialog>
    <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={cancelMeeting} loading={busy} tone="danger" title={`Cancel ${cancelTarget?.title ?? "meeting"}?`} confirmLabel="Cancel meeting" consequence="All attendees will be notified. The meeting remains in the calendar as a cancelled record." />
  </div>;
}
