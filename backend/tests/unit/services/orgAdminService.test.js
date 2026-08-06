import { describe, it, expect } from "vitest";
import {
  defaultSeatLimitForPlan,
  serializeSeats,
} from "../../../services/orgAdminService.js";

describe("orgAdminService helpers", () => {
  it("defaults Business to 10 seats and Enterprise to unlimited", () => {
    expect(defaultSeatLimitForPlan("business")).toBe(10);
    expect(defaultSeatLimitForPlan("enterprise")).toBe(-1);
    expect(defaultSeatLimitForPlan("unknown")).toBe(10);
  });

  it("serializes seat remaining from active members", () => {
    const seats = serializeSeats({
      seatLimit: 5,
      members: [
        { status: "active" },
        { status: "active" },
        { status: "invited" },
      ],
    });
    expect(seats).toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
      unlimited: false,
    });
  });

  it("serializes unlimited seats", () => {
    expect(
      serializeSeats({ seatLimit: -1, members: [{ status: "active" }] })
    ).toEqual({
      limit: null,
      used: 1,
      remaining: null,
      unlimited: true,
    });
  });
});
