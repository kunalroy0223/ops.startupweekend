import { createHash } from "node:crypto";

export interface AutomationRunIdentity {
  ruleId: string;
  ruleKey: string;
  targetType: string;
  targetId: string;
  recipientUserId: string;
  occurrenceKey: string;
  workspaceId?: string;
}

/** Stable across worker invocations; never includes the invocation timestamp. */
export function automationRunDocumentId(identity: AutomationRunIdentity, organizationId: string): string {
  return createHash("sha256")
    .update([
      organizationId,
      identity.workspaceId ?? "",
      identity.ruleId,
      identity.targetType,
      identity.targetId,
      identity.recipientUserId,
      identity.occurrenceKey,
    ].join("\u0000"))
    .digest("hex");
}
