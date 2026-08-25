export interface CycloneBulletin {
  stormName: string;
  maxSignal: number;
}

export interface CycloneSource {
  fetchActiveCyclone(): Promise<CycloneBulletin | null>;
}
