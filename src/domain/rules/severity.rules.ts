import { SeverityLevel } from "../entities/hazard-event";
import { FloodBulletin } from "../ports/flood-source";

export function quakeSeverity(magnitude: number): SeverityLevel {
  if (magnitude >= 6.0) return "critical";
  if (magnitude >= 4.5) return "warning";
  return "info";
}

export function cycloneSeverity(maxSignal: number): SeverityLevel {
  if (maxSignal >= 3) return "critical";
  if (maxSignal >= 2) return "warning";
  return "advisory";
}

export function floodSeverity(bulletin: FloodBulletin): SeverityLevel {
  if (bulletin.isRedAlert) return "critical";
  if (bulletin.isOrangeAlert) return "warning";
  return "advisory";
}
