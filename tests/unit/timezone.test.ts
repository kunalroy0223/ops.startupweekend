import { describe, expect, it } from "vitest";
import { dateTimeInputInTimeZone, dateTimeToIso, formatDateTimeInTimeZone } from "@/lib/timezone";

describe("organisation timezone date and time handling", () => {
  it("stores and reads a local deadline without using the browser timezone", () => {
    for (const timeZone of ["Asia/Kolkata", "America/New_York", "Europe/London"]) {
      const iso = dateTimeToIso("2026-11-20T17:45", timeZone);
      expect(iso).not.toBeNull();
      expect(dateTimeInputInTimeZone(iso!, timeZone)).toBe("2026-11-20T17:45");
      expect(formatDateTimeInTimeZone(iso!, timeZone)).toContain("20 Nov 2026");
    }
  });

  it("rejects invalid calendar dates, malformed values and invalid times", () => {
    expect(dateTimeToIso("2026-02-30T12:00", "Asia/Kolkata")).toBeNull();
    expect(dateTimeToIso("20-11-2026T12:00", "Asia/Kolkata")).toBeNull();
    expect(dateTimeToIso("2026-11-20T24:00", "Asia/Kolkata")).toBeNull();
    expect(dateTimeToIso("2026-03-08T02:30", "America/New_York")).toBeNull();
  });
});
