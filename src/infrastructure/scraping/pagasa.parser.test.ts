import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFloodAlertMarkers, detectMaxTcwsSignal, extractStormName } from "./pagasa.parser";

test("detectMaxTcwsSignal finds the highest hoisted signal", () => {
  assert.equal(detectMaxTcwsSignal("TCWS No. 3 is up in some areas, Signal No. 2 elsewhere"), 3);
});

test("detectMaxTcwsSignal defaults to 1 when no signal marker is present", () => {
  assert.equal(detectMaxTcwsSignal("no signals hoisted"), 1);
});

test("extractStormName parses typhoon category and name", () => {
  assert.equal(extractStormName("SUPER TYPHOON PEPITO continues to move west"), "SUPER TYPHOON PEPITO");
});

test("extractStormName falls back when no storm name is found", () => {
  assert.equal(extractStormName("no cyclone text here"), "Active Tropical Cyclone");
});

test("detectFloodAlertMarkers reports red alert on severe warning text", () => {
  const result = detectFloodAlertMarkers("Severe Flood Warning issued for Marikina River, Critical Level reached");
  assert.deepEqual(result, { hasFloodAlert: true, isRedAlert: true, isOrangeAlert: false });
});

test("detectFloodAlertMarkers reports no alert when absent", () => {
  const result = detectFloodAlertMarkers("all rivers normal");
  assert.deepEqual(result, { hasFloodAlert: false, isRedAlert: false, isOrangeAlert: false });
});
