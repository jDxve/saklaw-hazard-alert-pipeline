export interface QuakeObservation {
  occurredAt: string;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  location: string;
}

export interface QuakeSource {
  fetchRecentQuakes(): Promise<QuakeObservation[]>;
}
