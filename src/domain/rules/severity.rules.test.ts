import assert from "node:assert/strict";
import { test } from "node:test";
import { cycloneSeverity, floodSeverity, quakeSeverity } from "./severity.rules";

test("quakeSeverity classifies by magnitude threshold", () => {
  assert.equal(quakeSeverity(6.0), "critical");
  assert.equal(quakeSeverity(4.5), "warning");
  assert.equal(quakeSeverity(4.4), "info");
});

test("cycloneSeverity classifies by TCWS signal threshold", () => {
  assert.equal(cycloneSeverity(3), "critical");
  assert.equal(cycloneSeverity(2), "warning");
  assert.equal(cycloneSeverity(1), "advisory");
});

test("floodSeverity reports an advisory while any basin is on watch", () => {
  assert.equal(
    floodSeverity({
      basinsOnWatch: [{ name: "Pampanga", bulletinUrl: null }],
      basinsMonitored: 22,
    }),
    "advisory",
  );
});

test("floodSeverity stays at info when no basin is on watch", () => {
  assert.equal(floodSeverity({ basinsOnWatch: [], basinsMonitored: 22 }), "info");
});
