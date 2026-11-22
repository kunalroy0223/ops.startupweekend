import { describe, expect, it } from "vitest";
import { meetingCreateSchema, meetingResponseSchema, meetingUpdateSchema } from "@/domain/validation";

const validMeeting = {
  title: "Weekly planning",
  startAt: "2026-11-24T04:30:00.000Z",
  endAt: "2026-11-24T05:00:00.000Z",
  location: "Conference room",
  attendeeUserIds: ["member_1"],
};

describe("Module 8 meeting validation", () => {
  it("accepts a valid scheduled meeting", () => {
    expect(meetingCreateSchema.safeParse(validMeeting).success).toBe(true);
  });

  it("requires the end to follow the start", () => {
    const result = meetingCreateSchema.safeParse({ ...validMeeting, endAt: validMeeting.startAt });
    expect(result.success).toBe(false);
  });

  it("limits meeting duration to twelve hours", () => {
    const result = meetingCreateSchema.safeParse({ ...validMeeting, endAt: "2026-11-24T17:00:00.000Z" });
    expect(result.success).toBe(false);
  });

  it("requires either a location or an HTTP(S) meeting link", () => {
    expect(meetingCreateSchema.safeParse({ ...validMeeting, location: undefined }).success).toBe(false);
    expect(meetingCreateSchema.safeParse({ ...validMeeting, location: undefined, meetingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(meetingCreateSchema.safeParse({ ...validMeeting, location: undefined, meetingUrl: "https://meet.google.com/abc-defg-hij" }).success).toBe(true);
  });

  it("reserves one of the 30 attendee slots for the organiser", () => {
    const thirtyInvitees = Array.from({ length: 30 }, (_, index) => `member_${index}`);
    expect(meetingCreateSchema.safeParse({ ...validMeeting, attendeeUserIds: thirtyInvitees }).success).toBe(false);
    expect(meetingCreateSchema.safeParse({ ...validMeeting, attendeeUserIds: thirtyInvitees.slice(0, 29) }).success).toBe(true);
  });

  it("requires a non-empty update and accepts valid RSVP responses", () => {
    expect(meetingUpdateSchema.safeParse({}).success).toBe(false);
    expect(meetingUpdateSchema.safeParse({ title: "Updated planning" }).success).toBe(true);
    expect(meetingResponseSchema.safeParse({ response: "accepted" }).success).toBe(true);
    expect(meetingResponseSchema.safeParse({ response: "pending" }).success).toBe(false);
  });
});
