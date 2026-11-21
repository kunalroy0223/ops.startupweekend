import { z } from "zod";
import type { AutomationTriggerType } from "@/domain/types";

const taskDueSoonConfig = z.object({
  leadMinutes: z.number().int().min(15).max(10_080),
}).strict();

const taskOverdueConfig = z.object({
  repeatHours: z.number().int().min(24).max(168),
}).strict();

const crmFollowUpConfig = z.object({
  repeatHours: z.number().int().min(12).max(168),
}).strict();

const crmReplyWaitingConfig = z.object({
  waitHours: z.number().int().min(4).max(168),
}).strict();

export const AUTOMATION_RULES = {
  task_due_soon: {
    label: "Task due soon",
    description: "Remind the accountable owner before an open task deadline.",
    triggerType: "scheduled_query" as const satisfies AutomationTriggerType,
    executionAvailable: true,
    configSchema: taskDueSoonConfig,
    defaultConfig: { leadMinutes: 1_440 },
  },
  task_overdue: {
    label: "Task overdue",
    description: "Remind the accountable owner about an open overdue task.",
    triggerType: "scheduled_query" as const satisfies AutomationTriggerType,
    executionAvailable: true,
    configSchema: taskOverdueConfig,
    defaultConfig: { repeatHours: 24 },
  },
  crm_follow_up_due: {
    label: "CRM follow-up due",
    description: "Remind the assigned Inhub owner about a scheduled follow-up with a CRM contact.",
    triggerType: "scheduled_query" as const satisfies AutomationTriggerType,
    executionAvailable: true,
    configSchema: crmFollowUpConfig,
    defaultConfig: { repeatHours: 24 },
  },
  crm_reply_waiting: {
    label: "CRM reply waiting",
    description: "Remind the assigned owner when an inbound CRM reply is awaiting a response.",
    triggerType: "scheduled_query" as const satisfies AutomationTriggerType,
    executionAvailable: true,
    configSchema: crmReplyWaitingConfig,
    defaultConfig: { waitHours: 24 },
  },
} as const;

export type AutomationRuleKey = keyof typeof AUTOMATION_RULES;
export type AutomationRuleConfig = Record<string, string | number | boolean | string[] | null>;

export function isAutomationRuleKey(value: string): value is AutomationRuleKey {
  return Object.prototype.hasOwnProperty.call(AUTOMATION_RULES, value);
}

export function isAutomationRuleExecutable(ruleKey: string): boolean {
  return isAutomationRuleKey(ruleKey) && AUTOMATION_RULES[ruleKey].executionAvailable;
}

export function validateAutomationRuleConfig(ruleKey: string, config: unknown): AutomationRuleConfig {
  if (!isAutomationRuleKey(ruleKey)) throw new Error("unknown_automation_rule");
  return AUTOMATION_RULES[ruleKey].configSchema.parse(config) as AutomationRuleConfig;
}

export function automationRuleDefinition(ruleKey: AutomationRuleKey) {
  const definition = AUTOMATION_RULES[ruleKey];
  return {
    ruleKey,
    label: definition.label,
    description: definition.description,
    triggerType: definition.triggerType,
    executionAvailable: definition.executionAvailable,
    unavailableReason: "unavailableReason" in definition ? definition.unavailableReason : undefined,
    defaultConfig: definition.defaultConfig,
  };
}
