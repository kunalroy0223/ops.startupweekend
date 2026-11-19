import "server-only";
import type { Actor } from "@/domain/authz";
import { EVENT_CATALOGUE, isEventType } from "@/domain/events";
import type { NotificationPreferences } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";

/** Marks the actor's own notifications read. Other users' IDs are silently ignored. */
export async function markRead(actor: Actor, input: { ids: string[] } | { all: true }): Promise<number> {
  const db = adminDb();
  const batch = db.batch();
  let n = 0;
  if ("all" in input) {
    const snap = await col("notifications").where("recipientUserId", "==", actor.uid).where("readAt", "==", null).limit(400).get();
    snap.docs.forEach((d) => {
      batch.update(d.ref, { readAt: now() });
      n++;
    });
  } else {
    const snaps = await db.getAll(...input.ids.map((id) => col("notifications").doc(id)));
    for (const s of snaps) {
      if (s.exists && s.data()?.recipientUserId === actor.uid && !s.data()?.readAt) {
        batch.update(s.ref, { readAt: now() });
        n++;
      }
    }
  }
  if (n) await batch.commit();
  return n;
}

export async function updatePreferences(actor: Actor, prefs: Omit<NotificationPreferences, "userId" | "organizationId" | "updatedAt">, requestId: string) {
  // Essential events cannot be muted (workflow spec §5.2); drop them and unknown types.
  const disabled = prefs.disabledEventTypes.filter((t) => isEventType(t) && !EVENT_CATALOGUE[t].essential);
  const ref = col("notificationPreferences").doc(actor.uid);
  const batch = adminDb().batch();
  const value = { organizationId: serverEnv().ORGANIZATION_ID, userId: actor.uid, ...prefs, disabledEventTypes: disabled, updatedAt: now() };
  batch.set(ref, value);
  writeAudit(batch, { actorUserId: actor.uid, action: "notification_preferences.updated", resourceType: "user", resourceId: actor.uid, subjectUserIds: [actor.uid], after: { ...prefs, disabledEventTypes: disabled }, requestId });
  await batch.commit();
}
