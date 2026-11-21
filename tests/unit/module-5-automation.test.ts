import { describe, expect, it } from "vitest";
import {
  dueSoonOccurrenceKey,
  isAutomationTaskOpen,
  isTaskDueSoon,
  isTaskOverdue,
  overdueOccurrenceKey,
} from "@/domain/automation";
import { DEFAULT_PREFERENCES, EVENT_CATALOGUE, EVENT_TYPES, resolveChannels } from "@/domain/events";
import { AUTOMATION_RULES, isAutomationRuleExecutable, validateAutomationRuleConfig } from "@/server/automation/registry";

const NOW = Date.parse("2026-11-21T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

describe("Module 5 task reminder automation", () => {
  it("detects due-soon tasks only inside the configured lead window", () => {
    expect(isTaskDueSoon(new Date(NOW + 24 * HOUR).toISOString(), NOW, 1_440)).toBe(true);
    expect(isTaskDueSoon(new Date(NOW + 24 * HOUR + 1).toISOString(), NOW, 1_440)).toBe(false);
    expect(isTaskDueSoon("not-a-date", NOW, 1_440)).toBe(false);
  });

  it("detects overdue deadlines and ignores future deadlines", () => {
    expect(isTaskOverdue(new Date(NOW - 1).toISOString(), NOW)).toBe(true);
    expect(isTaskOverdue(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(isTaskOverdue(new Date(NOW + 1).toISOString(), NOW)).toBe(false);
  });

  it("uses stable keys for due-soon and bounded repeat buckets for overdue work", () => {
    const dueAt = new Date(NOW + HOUR).toISOString();
    expect(dueSoonOccurrenceKey(dueAt)).toBe(dueSoonOccurrenceKey(dueAt));
    const overdueAt = new Date(NOW - 25 * HOUR).toISOString();
    expect(overdueOccurrenceKey(overdueAt, NOW, 24)).toBe(overdueOccurrenceKey(overdueAt, NOW + HOUR, 24));
    expect(overdueOccurrenceKey(overdueAt, NOW + 24 * HOUR, 24)).not.toBe(overdueOccurrenceKey(overdueAt, NOW, 24));
  });

  it("only treats actionable task states as eligible for reminders", () => {
    for (const status of ["backlog", "assigned", "in_progress", "blocked"]) {
      expect(isAutomationTaskOpen({ status })).toBe(true);
    }
    for (const status of ["in_review", "completed", "cancelled"]) {
      expect(isAutomationTaskOpen({ status })).toBe(false);
    }
    expect(isAutomationTaskOpen({ status: "in_progress", archivedAt: "2026-11-21T00:00:00.000Z" })).toBe(false);
  });

  it("makes only task reminder rules executable until CRM follow-up workflows exist", () => {
    expect(Object.keys(AUTOMATION_RULES)).toEqual(["task_due_soon", "task_overdue", "crm_follow_up_due", "crm_reply_waiting"]);
    expect(isAutomationRuleExecutable("task_due_soon")).toBe(true);
    expect(isAutomationRuleExecutable("task_overdue")).toBe(true);
    expect(isAutomationRuleExecutable("crm_follow_up_due")).toBe(false);
    expect(isAutomationRuleExecutable("crm_reply_waiting")).toBe(false);
    expect(validateAutomationRuleConfig("task_overdue", { repeatHours: 24 })).toEqual({ repeatHours: 24 });
  });

  it("registers due and overdue reminder events as optional Module 5 notifications", () => {
    for (const type of ["TASK_DUE_SOON", "TASK_OVERDUE"] as const) {
      expect(EVENT_TYPES).toContain(type);
      expect(EVENT_CATALOGUE[type].productModule).toBe(5);
      expect(EVENT_CATALOGUE[type].essential).toBe(false);
      expect(resolveChannels(type, DEFAULT_PREFERENCES)).toEqual({ inApp: true, email: "immediate" });
      expect(resolveChannels(type, { ...DEFAULT_PREFERENCES, deliveryMode: "daily_digest" })).toEqual({ inApp: true, email: "digest" });
    }
  });
});
