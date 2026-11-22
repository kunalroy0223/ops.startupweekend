import { describe, expect, it } from "vitest";
import {
  canTransitionAllocation,
  canTransitionAsset,
  canTransitionEvent,
  canTransitionProgramme,
  canTransitionSession,
  canFitReservation,
  hasAvailableCapacity,
  maximumConcurrentQuantity,
  overlapsWindow,
} from "@/domain/operational-modules";

describe("Module 10 programme and event lifecycles", () => {
  it("allows only the declared programme transitions", () => {
    expect(canTransitionProgramme("draft", "active")).toBe(true);
    expect(canTransitionProgramme("active", "completed")).toBe(true);
    expect(canTransitionProgramme("completed", "active")).toBe(false);
    expect(canTransitionProgramme("archived", "active")).toBe(false);
  });

  it("requires event confirmation before live delivery", () => {
    expect(canTransitionEvent("planning", "confirmed")).toBe(true);
    expect(canTransitionEvent("confirmed", "live")).toBe(true);
    expect(canTransitionEvent("planning", "live")).toBe(false);
    expect(canTransitionEvent("completed", "planning")).toBe(false);
  });

  it("prevents completed and cancelled sessions from reopening", () => {
    expect(canTransitionSession("planned", "live")).toBe(true);
    expect(canTransitionSession("live", "completed")).toBe(true);
    expect(canTransitionSession("completed", "live")).toBe(false);
  });
});

describe("Module 11 allocation lifecycle and capacity", () => {
  it("enforces request, approval, checkout and return order", () => {
    expect(canTransitionAllocation("requested", "approved")).toBe(true);
    expect(canTransitionAllocation("approved", "checked_out")).toBe(true);
    expect(canTransitionAllocation("checked_out", "returned")).toBe(true);
    expect(canTransitionAllocation("returned", "checked_out")).toBe(false);
    expect(canTransitionAllocation("rejected", "approved")).toBe(false);
  });

  it("does not over-allocate registered quantity", () => {
    expect(hasAvailableCapacity(5, 3, 2)).toBe(true);
    expect(hasAvailableCapacity(5, 4, 2)).toBe(false);
    expect(hasAvailableCapacity(5, 0, 0)).toBe(false);
  });

  it("uses half-open time windows so adjacent bookings do not overlap", () => {
    expect(overlapsWindow("2026-11-22T09:00:00.000Z", "2026-11-22T10:00:00.000Z", "2026-11-22T10:00:00.000Z", "2026-11-22T11:00:00.000Z")).toBe(false);
    expect(overlapsWindow("2026-11-22T09:00:00.000Z", "2026-11-22T10:30:00.000Z", "2026-11-22T10:00:00.000Z", "2026-11-22T11:00:00.000Z")).toBe(true);
  });
});


describe("Module 11 asset lifecycle and utilisation", () => {
  it("prevents retired or archived resources from returning to circulation", () => {
    expect(canTransitionAsset("available", "maintenance")).toBe(true);
    expect(canTransitionAsset("maintenance", "available")).toBe(true);
    expect(canTransitionAsset("retired", "available")).toBe(false);
    expect(canTransitionAsset("archived", "available")).toBe(false);
  });

  it("calculates peak overlapping utilisation instead of summing all reservations", () => {
    expect(maximumConcurrentQuantity([
      { startAt: "2026-11-22T09:00:00.000Z", endAt: "2026-11-22T10:00:00.000Z", quantity: 2 },
      { startAt: "2026-11-22T10:00:00.000Z", endAt: "2026-11-22T11:00:00.000Z", quantity: 2 },
    ])).toBe(2);
    expect(maximumConcurrentQuantity([
      { startAt: "2026-11-22T09:00:00.000Z", endAt: "2026-11-22T11:00:00.000Z", quantity: 2 },
      { startAt: "2026-11-22T10:00:00.000Z", endAt: "2026-11-22T12:00:00.000Z", quantity: 3 },
    ])).toBe(5);
  });



  it("calculates capacity only during the requested interval, not by summing separate bookings", () => {
    expect(canFitReservation(3, { startAt: "2026-11-22T09:00:00.000Z", endAt: "2026-11-22T11:00:00.000Z", quantity: 1 }, [
      { startAt: "2026-11-22T09:00:00.000Z", endAt: "2026-11-22T10:00:00.000Z", quantity: 2 },
      { startAt: "2026-11-22T10:00:00.000Z", endAt: "2026-11-22T11:00:00.000Z", quantity: 2 },
    ])).toBe(true);
  });

  it("counts checked-out resources from an early checkout until return", () => {
    expect(canFitReservation(1, { startAt: "2026-11-22T09:30:00.000Z", endAt: "2026-11-22T10:30:00.000Z", quantity: 1 }, [
      { startAt: "2026-11-22T10:00:00.000Z", endAt: "2026-11-22T12:00:00.000Z", quantity: 1, checkedOut: true, checkedOutAt: "2026-11-22T09:00:00.000Z" },
    ])).toBe(false);
  });

  it("fails closed when a reservation window or quantity is invalid", () => {
    expect(maximumConcurrentQuantity([{ startAt: "bad", endAt: "2026-11-22T10:00:00.000Z", quantity: 1 }])).toBe(Number.POSITIVE_INFINITY);
  });
});
