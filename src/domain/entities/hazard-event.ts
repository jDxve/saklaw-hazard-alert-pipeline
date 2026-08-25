export type HazardType = "quake" | "volcanic" | "cyclone" | "flood" | "severeWeather";
export type SeverityLevel = "info" | "advisory" | "warning" | "critical";

export interface QuakeDetails {
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  location: string;
}

export interface CycloneDetails {
  stormName: string;
  maxSignal: number;
  checkedAt: string;
}

export interface FloodDetails {
  checkedAt: string;
}

export interface HazardEvent {
  id: string;
  type: HazardType;
  severity: SeverityLevel;
  sourceType: "official";
  title: string;
  plainSummary: string;
  issuedAt: string;
  source: string;
  raw: QuakeDetails | CycloneDetails | FloodDetails;
}
