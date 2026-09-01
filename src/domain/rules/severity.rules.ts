import { SeverityLevel } from "../entities/hazard-event";
import { FloodBulletin } from "../ports/flood-source";

export function quakeSeverity(magnitude: number): SeverityLevel {
  if (magnitude >= 6.0) return "critical";
  if (magnitude >= 4.5) return "warning";
  return "info";
}

/**
 * A cyclone with no wind signal hoisted is still worth knowing about — it is in
 * PAR and PAGASA is bulletining it — but it is not a warning about wind, so it
 * grades as information rather than being pushed up to the lowest signal's
 * severity. Null is the source saying "no signal", not a missing reading.
 */
export function cycloneSeverity(maxSignal: number | null): SeverityLevel {
  if (maxSignal === null) return "info";
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
