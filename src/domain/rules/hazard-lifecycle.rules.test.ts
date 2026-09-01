import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../entities/hazard-event";
import { isActiveAt, lifecycleBasis } from "./hazard-lifecycle.rules";

function event(overrides: Partial<HazardEvent> = {}): HazardEvent {
  return {
    id: "e1",
    type: "cyclone",
    severity: "advisory",
    sourceType: "official",
    title: "t",
    plainSummary: "s",
    issuedAt: "2026-09-01T00:00:00.000Z",
    validUntil: null,
    location: null,
    affectedAreas: [],
    source: "DOST-PAGASA",
    raw: {
      stormName: "PILANDOK",
      category: null,
      maxSignal: null,
      center: null,
      centerDescription: null,
      movement: null,
      maximumWindsKph: null,
      gustsKph: null,
      forecastPositions: [],
      checkedAt: "2026-09-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

test("the agency's own validity decides, when it published one", () => {
  const bulletin = event({ validUntil: "2026-09-01T03:00:00.000Z" });

  assert.equal(isActiveAt(bulletin, new Date("2026-09-01T02:59:00Z")), true);
  assert.equal(isActiveAt(bulletin, new Date("2026-09-01T03:00:00Z")), false);
  assert.equal(lifecycleBasis(bulletin), "source");
});

test("without a published validity a cyclone lapses after one bulletin cycle", () => {
  // The regression this guards: an append-only store made every cyclone event
  // ever written read as currently active.
  const bulletin = event();

  assert.equal(isActiveAt(bulletin, new Date("2026-09-01T05:00:00Z")), true);
  assert.equal(isActiveAt(bulletin, new Date("2026-09-01T07:00:00Z")), false);
  assert.equal(lifecycleBasis(bulletin), "pipeline");
});

test("a quake stays listed for a day, then stops", () => {
  const quake = event({ type: "quake" });

  assert.equal(isActiveAt(quake, new Date("2026-09-01T20:00:00Z")), true);
  assert.equal(isActiveAt(quake, new Date("2026-09-02T01:00:00Z")), false);
});

test("an unreadable timestamp is not active rather than active forever", () => {
  assert.equal(isActiveAt(event({ issuedAt: "not a date" }), new Date()), false);
  assert.equal(isActiveAt(event({ validUntil: "not a date" }), new Date()), false);
});
