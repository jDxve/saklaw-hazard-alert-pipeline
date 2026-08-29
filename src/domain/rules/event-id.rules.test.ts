import assert from "node:assert/strict";
import { test } from "node:test";
import { QuakeObservation } from "../ports/quake-source";
import { cycloneEventId, floodEventId, hourBucket, quakeEventId } from "./event-id.rules";

function observation(overrides: Partial<QuakeObservation> = {}): QuakeObservation {
  return {
    occurredAt: "2026-08-25T06:00:00.000Z",
    lat: 13.5,
    lon: 121.0,
    depthKm: 10,
    magnitude: 4.0,
    location: "Batangas",
    ...overrides,
  };
}

test("quakeEventId is stable for the same observation", () => {
  assert.equal(quakeEventId(observation()), quakeEventId(observation()));
});

test("quakeEventId separates distinct quakes sharing a timestamp", () => {
  const a = quakeEventId(observation({ lat: 13.5, lon: 121.0 }));
  const b = quakeEventId(observation({ lat: 9.1, lon: 125.4 }));
  assert.notEqual(a, b);
});

test("quakeEventId separates different magnitudes at the same epicentre", () => {
  assert.notEqual(
    quakeEventId(observation({ magnitude: 4.0 })),
    quakeEventId(observation({ magnitude: 5.0 })),
  );
});

test("quakeEventId contains no Firestore path separator", () => {
  const id = quakeEventId(observation({ lat: -5.5, lon: 121.0 }));
  assert.ok(!id.includes("/"));
});

test("hourBucket keeps the UTC hour", () => {
  assert.equal(hourBucket("2026-08-25T06:42:11.000Z"), "2026-08-25T06");
});

test("cycloneEventId dedupes within an hour at the same signal", () => {
  assert.equal(
    cycloneEventId("2026-08-25T06:05:00.000Z", 2),
    cycloneEventId("2026-08-25T06:55:00.000Z", 2),
  );
});

test("cycloneEventId lets an escalation inside the same hour through", () => {
  assert.notEqual(
    cycloneEventId("2026-08-25T06:05:00.000Z", 2),
    cycloneEventId("2026-08-25T06:55:00.000Z", 5),
  );
});

test("floodEventId lets a severity change inside the same hour through", () => {
  assert.notEqual(
    floodEventId("2026-08-25T06:05:00.000Z", "warning", ["Pampanga"]),
    floodEventId("2026-08-25T06:55:00.000Z", "critical", ["Pampanga"]),
  );
});

test("floodEventId dedupes while the same basins stay on watch", () => {
  assert.equal(
    floodEventId("2026-08-25T06:05:00.000Z", "advisory", ["Pampanga", "Agno"]),
    floodEventId("2026-08-25T06:55:00.000Z", "advisory", ["Agno", "Pampanga"]),
  );
});

test("floodEventId lets a flood spreading to a new basin through", () => {
  assert.notEqual(
    floodEventId("2026-08-25T06:05:00.000Z", "advisory", ["Pampanga"]),
    floodEventId("2026-08-25T06:55:00.000Z", "advisory", ["Pampanga", "Bicol"]),
  );
});
