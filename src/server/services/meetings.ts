import "server-only";
import type { Query, WriteBatch } from "firebase-admin/firestore";
import type { Actor } from "@/domain/authz";
import { isAdmin } from "@/domain/authz";
import type { Meeting, MeetingResponse, MeetingStatus, UserProfile } from "@/domain/types";
import { enqueueEvent, writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { forbidden, notFound } from "../http";
import { getOrganization, getUserDetail, listDirectory } from "../queries";

const org = () => serverEnv().ORGANIZATION_ID;

type MeetingInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  meetingUrl?: string;
  attendeeUserIds: string[];
};

type MeetingPatch = Partial<Omit<MeetingInput, "attendeeUserIds">> & { attendeeUserIds?: string[] };

async function assertAttendees(actor: Actor, values: string[], requiredUid = actor.uid) {
  const ids = [...new Set([...values, requiredUid])];
  if (ids.length > 30) throw forbidden("A meeting can have at most 30 attendees, including its organiser.");
  if (isAdmin(actor)) {
    const db = adminDb();
    const refs = ids.map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    if (snaps.some((snap) => !snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "active")) {
      throw forbidden("Every attendee must have an active Inhub Workspace account.");
    }
    return ids;
  }
  const visible = await Promise.all(ids.filter((uid) => uid !== actor.uid).map((uid) => getUserDetail(actor, uid)));
  if (visible.some((detail) => !detail || detail.user.status !== "active")) {
    throw forbidden("You can only invite active people who share your team or workstream scope.");
  }
  return ids;
}

function meetingEvent(batch: WriteBatch, actor: Actor, meeting: Pick<Meeting, "id" | "title" | "startAt" | "endAt" | "timeZone" | "attendeeUserIds">, action: "scheduled" | "updated" | "cancelled") {
  enqueueEvent(batch, {
    eventType: "MEETING_INVITED",
    actorUserId: actor.uid,
    resourceType: "meeting",
    resourceId: meeting.id,
    payload: {
      meetingId: meeting.id,
      title: meeting.title,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      timeZone: meeting.timeZone,
      attendeeUserIds: meeting.attendeeUserIds,
      action,
    },
  });
}

export async function listMeetings(actor: Actor, fromAt: string, toAt: string): Promise<Meeting[]> {
  const base: Query = col("meetings")
    .where("organizationId", "==", org())
    .where("startAt", ">=", fromAt)
    .where("startAt", "<", toAt);
  if (isAdmin(actor)) {
    const snap = await base.orderBy("startAt", "asc").limit(300).get();
    return snap.docs.map((doc) => fromDoc<Meeting>(doc)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  const [organised, invited] = await Promise.all([
    base.where("organizerUserId", "==", actor.uid).orderBy("startAt", "asc").limit(300).get(),
    base.where("attendeeUserIds", "array-contains", actor.uid).orderBy("startAt", "asc").limit(300).get(),
  ]);
  const unique = new Map<string, Meeting>();
  for (const doc of [...organised.docs, ...invited.docs]) {
    const meeting = fromDoc<Meeting>(doc);
    if (meeting.organizationId === org()) unique.set(meeting.id, meeting);
  }
  return [...unique.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function createMeeting(actor: Actor, input: MeetingInput, requestId: string): Promise<string> {
  const attendees = await assertAttendees(actor, input.attendeeUserIds);
  const ref = col("meetings").doc();
  const organization = await getOrganization();
  const meeting: Omit<Meeting, "id"> = {
    organizationId: org(),
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    timeZone: organization?.timezone ?? "Asia/Kolkata",
    location: input.location,
    meetingUrl: input.meetingUrl,
    organizerUserId: actor.uid,
    attendeeUserIds: attendees,
    responses: { [actor.uid]: "accepted" },
    status: "scheduled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const batch = adminDb().batch();
  batch.create(ref, { ...meeting, createdAt: now(), updatedAt: now() });
  writeAudit(batch, {
    actorUserId: actor.uid,
    action: "meeting.created",
    resourceType: "meeting",
    resourceId: ref.id,
    subjectUserIds: attendees,
    after: { title: meeting.title, startAt: meeting.startAt, endAt: meeting.endAt, attendeeUserIds: attendees },
    requestId,
  });
  meetingEvent(batch, actor, { ...meeting, id: ref.id }, "scheduled");
  await batch.commit();
  return ref.id;
}

async function loadMeeting(id: string): Promise<Meeting> {
  const snap = await col("meetings").doc(id).get();
  if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Meeting not found.");
  return fromDoc<Meeting>(snap);
}

export async function getMeetingForActor(actor: Actor, id: string): Promise<Meeting> {
  const meeting = await loadMeeting(id);
  if (!isAdmin(actor) && meeting.organizerUserId !== actor.uid && !meeting.attendeeUserIds.includes(actor.uid)) {
    throw notFound("Meeting not found.");
  }
  return meeting;
}

function assertCanManage(actor: Actor, meeting: Meeting) {
  if (!isAdmin(actor) && meeting.organizerUserId !== actor.uid) throw forbidden("Only the organiser or an Admin can change this meeting.");
}

export async function updateMeeting(actor: Actor, id: string, patch: MeetingPatch, requestId: string) {
  const before = await loadMeeting(id);
  assertCanManage(actor, before);
  if (before.status !== "scheduled") throw forbidden("Only scheduled meetings can be edited.");
  let attendeeUserIds = before.attendeeUserIds;
  if (patch.attendeeUserIds) {
    attendeeUserIds = [...new Set([...patch.attendeeUserIds, before.organizerUserId])];
    if (attendeeUserIds.length > 30) throw forbidden("A meeting can have at most 30 attendees, including its organiser.");
    const newlyAdded = attendeeUserIds.filter((uid) => !before.attendeeUserIds.includes(uid));
    if (newlyAdded.length) await assertAttendees(actor, newlyAdded, before.organizerUserId);
  }
  const next = {
    ...before,
    ...patch,
    attendeeUserIds,
    responses: Object.fromEntries(Object.entries(before.responses ?? {}).filter(([uid]) => attendeeUserIds.includes(uid))),
    updatedAt: new Date().toISOString(),
  } as Meeting;
  const startAt = next.startAt;
  const endAt = next.endAt;
  const duration = Date.parse(endAt) - Date.parse(startAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 12 * 60 * 60_000) {
    throw forbidden("Choose a valid meeting end time after its start, no more than 12 hours later.");
  }
  if (!(next.location?.trim() || next.meetingUrl?.trim())) {
    throw forbidden("A scheduled meeting must have a location or meeting link.");
  }
  const batch = adminDb().batch();
  batch.update(col("meetings").doc(id), {
    ...patch,
    attendeeUserIds,
    responses: next.responses,
    updatedAt: now(),
  });
  writeAudit(batch, {
    actorUserId: actor.uid,
    action: "meeting.updated",
    resourceType: "meeting",
    resourceId: id,
    subjectUserIds: [...new Set([...before.attendeeUserIds, ...attendeeUserIds])],
    before: { title: before.title, startAt: before.startAt, endAt: before.endAt, attendeeUserIds: before.attendeeUserIds },
    after: { title: next.title, startAt: next.startAt, endAt: next.endAt, attendeeUserIds },
    requestId,
  });
  meetingEvent(batch, actor, next, "updated");
  await batch.commit();
}

export async function cancelMeeting(actor: Actor, id: string, requestId: string) {
  const meeting = await loadMeeting(id);
  assertCanManage(actor, meeting);
  if (meeting.status !== "scheduled") throw forbidden("This meeting is already cancelled or completed.");
  const batch = adminDb().batch();
  batch.update(col("meetings").doc(id), { status: "cancelled" satisfies MeetingStatus, cancelledAt: now(), updatedAt: now() });
  writeAudit(batch, {
    actorUserId: actor.uid,
    action: "meeting.cancelled",
    resourceType: "meeting",
    resourceId: id,
    subjectUserIds: meeting.attendeeUserIds,
    before: { status: meeting.status },
    after: { status: "cancelled", title: meeting.title },
    requestId,
  });
  meetingEvent(batch, actor, meeting, "cancelled");
  await batch.commit();
}

export async function respondToMeeting(actor: Actor, id: string, response: MeetingResponse, requestId: string) {
  const ref = col("meetings").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Meeting not found.");
    const meeting = fromDoc<Meeting>(snap);
    if (!meeting.attendeeUserIds.includes(actor.uid)) throw forbidden("You are not an attendee of this meeting.");
    if (meeting.status !== "scheduled") throw forbidden("Responses are closed for this meeting.");
    const before = meeting.responses?.[actor.uid] ?? "pending";
    tx.update(ref, { responses: { ...(meeting.responses ?? {}), [actor.uid]: response }, updatedAt: now() });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "meeting.response_updated",
      resourceType: "meeting",
      resourceId: id,
      subjectUserIds: [actor.uid],
      before: { response: before },
      after: { response },
      requestId,
    });
    enqueueEvent(tx, {
      eventType: "MEETING_RESPONSE_UPDATED",
      actorUserId: actor.uid,
      resourceType: "meeting",
      resourceId: id,
      payload: {
        meetingId: id,
        title: meeting.title,
        organizerUserId: meeting.organizerUserId,
        attendeeUserId: actor.uid,
        response,
        startAt: meeting.startAt,
        timeZone: meeting.timeZone,
      },
    });
  });
}

export async function listMeetingPeople(actor: Actor): Promise<{ uid: string; displayName: string; role: string }[]> {
  // Admins can invite any active member in the organisation. Do not use
  // listDirectory here: its default Firestore orderBy("searchName") excludes
  // legacy user documents where that optional search field was never written.
  if (isAdmin(actor)) {
    const snapshot = await col("users").where("organizationId", "==", org()).get();
    return snapshot.docs
      .map((doc) => fromDoc<UserProfile>(doc, "uid"))
      .filter((user) => user.status === "active" && user.uid !== actor.uid)
      .map((user) => ({
        uid: user.uid,
        displayName: user.displayName?.trim() || user.email || "Inhub member",
        role: user.role,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid));
  }

  // Leads and Team Members remain limited to people visible in their assigned
  // team/workstream scope. Fetch all pages so large rosters remain selectable.
  const people: { uid: string; displayName: string; role: string }[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 40; pageNumber += 1) {
    const page = await listDirectory(actor, cursor ? { cursor } : {});
    people.push(...page.users
      .filter((user) => user.status === "active" && user.uid !== actor.uid)
      .map((user) => ({ uid: user.uid, displayName: user.displayName, role: user.role })));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return people;
}
