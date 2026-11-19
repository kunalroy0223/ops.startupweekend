import "server-only";
import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export const COL = {
  organizations: "organizations",
  workspaces: "workspaces",
  users: "users",
  invitations: "invitations",
  workstreams: "workstreams",
  teams: "teams",
  workstreamMemberships: "workstreamMemberships",
  teamMemberships: "teamMemberships",
  workstreamTeams: "workstreamTeams",
  notifications: "notifications",
  notificationPreferences: "notificationPreferences",
  domainEvents: "domainEvents",
  emailDeliveries: "emailDeliveries",
  auditLogs: "auditLogs",
  webhookReceipts: "webhookReceipts",
  rateLimits: "rateLimits",
} as const;

export const SCHEMA_VERSION = 1;

export const col = (name: keyof typeof COL) => adminDb().collection(COL[name]);

/** Deterministic membership IDs give one active relationship per user and scope (schema §4.7). */
export const membershipId = (scopeId: string, userId: string) => `${scopeId}_${userId}`;
export const workstreamTeamId = (workstreamId: string, teamId: string) => `${workstreamId}_${teamId}`;

function convert(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
  }
  return value;
}

/** Snapshot → plain serialisable object with Timestamps as ISO strings. */
export function fromDoc<T>(snap: DocumentSnapshot | QueryDocumentSnapshot, idField = "id"): T {
  const data = convert(snap.data() ?? {}) as Record<string, unknown>;
  return { ...data, [idField]: snap.id } as T;
}

export function now(): Timestamp {
  return Timestamp.now();
}

export function tsFromMs(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}
