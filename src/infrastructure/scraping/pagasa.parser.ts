import { TCWS_PATTERNS } from "../../config/constants";

export function detectMaxTcwsSignal(text: string): number {
  for (const { signal, markers } of TCWS_PATTERNS) {
    if (markers.some((marker) => text.includes(marker))) return signal;
  }
  return 1;
}

const STORM_NAME_REGEX =
  /(SUPER TYPHOON|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION)\s+([A-Z]+)/i;

export function extractStormName(text: string): string {
  const match = text.match(STORM_NAME_REGEX);
  return match
    ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}`
    : "Active Tropical Cyclone";
}

export function detectFloodAlertMarkers(text: string): { hasFloodAlert: boolean; isRedAlert: boolean; isOrangeAlert: boolean } {
  const hasFloodAlert = text.includes("Flood Warning") || text.includes("Flood Alert");
  const isRedAlert = text.includes("Severe Flood Warning") || text.includes("Critical Level");
  const isOrangeAlert = text.includes("Flood Alert") || text.includes("Alarm Level");
  return { hasFloodAlert, isRedAlert, isOrangeAlert };
}
