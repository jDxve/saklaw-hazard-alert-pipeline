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

/**
 * The basin status table publishes a single binary state per basin — a basin is
 * on flood watch or it is not. PAGASA's finer classes (Flood Advisory, Flood
 * Warning, Critical Flood Warning) appear only inside each basin's PDF bulletin,
 * which this pipeline does not read, so classifying beyond "advisory" here would
 * be inventing a severity the source never gave us.
 */
export function floodSeverity(bulletin: FloodBulletin): SeverityLevel {
  return bulletin.basinsOnWatch.length > 0 ? "advisory" : "info";
}
