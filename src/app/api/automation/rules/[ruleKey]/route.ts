import { automationRuleUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateAutomationRule } from "@/server/services/automation";

export const PUT = route<{ ruleKey: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, automationRuleUpdateSchema);
  await updateAutomationRule(actor, params.ruleKey, input, requestId);
  return ok({ updated: true });
});
