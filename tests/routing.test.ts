import { describe, expect, it } from "vitest";
import { applyOrder, moveStop, positions, splitForOptimize, stopsAway } from "@/lib/routing";
import { addDays, isDay, minutesBetween, todayIn } from "@/lib/dates";

const p = { lat: 0, lng: 0 };

describe("optimize helpers", () => {
  it("keeps urgent stops first and applies the optimizer order to the rest", () => {
    const stops = [
      { id: 1, urgent: false, point: p },
      { id: 2, urgent: true, point: p },
      { id: 3, urgent: false, point: p },
      { id: 4, urgent: false, point: p },
    ];
    const { urgent, rest } = splitForOptimize(stops);
    expect(urgent.map((s) => s.id)).toEqual([2]);
    expect(rest.map((s) => s.id)).toEqual([1, 3, 4]);
    expect(applyOrder(urgent, rest, [2, 0, 1])).toEqual([2, 4, 1, 3]);
  });

  it("refuses an order that doesn't match the stops", () => {
    const rest = [
      { id: 1, urgent: false, point: p },
      { id: 2, urgent: false, point: p },
    ];
    expect(() => applyOrder([], rest, [0])).toThrow();
    expect(() => applyOrder([], rest, [0, 0])).toThrow();
    expect(() => applyOrder([], rest, [0, 5])).toThrow();
  });
});

describe("moveStop", () => {
  it("swaps with the neighbor", () => {
    expect(moveStop([1, 2, 3], 2, "up")).toEqual([2, 1, 3]);
    expect(moveStop([1, 2, 3], 2, "down")).toEqual([1, 3, 2]);
  });

  it("does nothing at the ends or for unknown stops", () => {
    expect(moveStop([1, 2, 3], 1, "up")).toEqual([1, 2, 3]);
    expect(moveStop([1, 2, 3], 3, "down")).toEqual([1, 2, 3]);
    expect(moveStop([1, 2, 3], 9, "up")).toEqual([1, 2, 3]);
  });

  it("numbers positions from 1", () => {
    expect(positions([7, 5])).toEqual([
      { id: 7, position: 1 },
      { id: 5, position: 2 },
    ]);
  });
});

describe("stopsAway", () => {
  const route = [
    { id: 1, position: 1, status: "done" },
    { id: 2, position: 2, status: "on_site" },
    { id: 3, position: 3, status: "not_done" },
    { id: 4, position: 4, status: "waiting" },
    { id: 5, position: 5, status: "waiting" },
  ];

  it("counts unfinished stops ahead", () => {
    expect(stopsAway(route, 5)).toBe(2);
    expect(stopsAway(route, 4)).toBe(1);
    expect(stopsAway(route, 2)).toBe(0);
    expect(stopsAway(route, 99)).toBeNull();
  });
});

describe("dates", () => {
  it("uses the business time zone for today", () => {
    // 2 AM UTC on Nov 19 is still Nov 18 in New York.
    const at = new Date("2026-11-19T02:00:00Z");
    expect(todayIn("America/New_York", at)).toBe("2026-11-18");
    expect(todayIn("UTC", at)).toBe("2026-11-19");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("checks day strings", () => {
    expect(isDay("2026-11-18")).toBe(true);
    expect(isDay("11/18/2026")).toBe(false);
    expect(isDay(undefined)).toBe(false);
  });

  it("never returns negative minutes", () => {
    const a = new Date("2026-11-18T10:00:00Z");
    expect(minutesBetween(a, new Date("2026-11-18T10:31:20Z"))).toBe(31);
    expect(minutesBetween(a, new Date("2026-11-18T09:00:00Z"))).toBe(0);
  });
});
