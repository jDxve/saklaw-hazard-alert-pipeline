/**
 * One area PAGASA has placed under a Tropical Cyclone Wind Signal.
 *
 * `area` keeps PAGASA's own wording for the clause rather than a tidied
 * province name: the bulletin writes things like "the northern portion of
 * mainland Quezon (General Nakar, Infanta)", and rewriting that into "Quezon"
 * would claim a coverage the source did not give.
 */
export interface TcwsArea {
  area: string;
  /** "Luzon", "Visayas", "Mindanao" — null when the bulletin did not group. */
  islandGroup: string | null;
  signalLevel: number;
}

/** Where the eye is, as published. Coordinates are null when not printed. */
export interface CycloneCenter {
  lat: number | null;
  lon: number | null;
  /** The full sentence, kept verbatim so nothing is lost in extraction. */
  description: string;
}

export interface ForecastPosition {
  /** ISO-8601 UTC, or null when the printed timestamp could not be read. */
  at: string | null;
  description: string;
}

/**
 * A Tropical Cyclone Bulletin, as published.
 *
 * Every field is nullable or empty-able on purpose. PAGASA omits plenty —
 * a depression carries no wind signal, an early bulletin carries no forecast
 * track — and the pipeline must be able to say "not published" rather than
 * substitute a value the source never gave.
 */
export interface CycloneBulletin {
  /** The name alone: "PILANDOK". */
  stormName: string;
  /** "Tropical Depression", "Super Typhoon" — null when unstated. */
  category: string | null;
  /**
   * The highest wind signal actually hoisted, or **null** when PAGASA says
   * "No Tropical Cyclone Wind Signal". Null is not signal 1: a depression with
   * no signal up is a different fact from a storm at the lowest signal.
   */
  maxSignal: number | null;
  issuedAt: string | null;
  /** From the bulletin's own "valid for broadcast until" line. */
  validUntil: string | null;
  center: CycloneCenter | null;
  movement: string | null;
  maximumWindsKph: number | null;
  gustsKph: number | null;
  forecastPositions: readonly ForecastPosition[];
  /** Empty when no signal is hoisted. Never inferred. */
  affectedAreas: readonly TcwsArea[];
}

export interface CycloneSource {
  fetchActiveCyclone(): Promise<CycloneBulletin | null>;
}
