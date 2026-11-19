import "server-only";
import type { Transaction, WriteBatch } from "firebase-admin/firestore";
import type { EventType } from "@/domain/events";
import { col, now } from "./db";
import { serverEnv } from "./env";

type Writer = Transaction | WriteBatch;

export interface AuditInput {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  subjectUserIds?: string[];
  workspaceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
}

/** Append-only audit record, written in the same transaction as the change it describes. */
export function writeAudit(w: Writer, input: AuditInput): string {
  const ref = col("auditLogs").doc();
  (w as WriteBatch).set(ref, {
    organizationId: serverEnv().ORGANIZATION_ID,
    ...input,
    subjectUserIds: [...new Set(input.subjectUserIds ?? [])],
    createdAt: now(),
  });
  return ref.id;
}

export interface EventInput {
  eventType: EventType;
  actorUserId?: string;
  resourceType: string;
  resourceId: string;
  workspaceId?: string;
  /** Minimal identifiers only. Never secrets or message bodies. */
  payload: Record<string, string | number | boolean | null | string[]>;
}

/** Transactional outbox: the event commits atomically with the business change. */
export function enqueueEvent(w: Writer, input: EventInput): string {
  const ref = col("domainEvents").doc();
  (w as WriteBatch).set(ref, {
    organizationId: serverEnv().ORGANIZATION_ID,
    ...input,
    status: "pending",
    attempts: 0,
    createdAt: now(),
  });
  return ref.id;
}
