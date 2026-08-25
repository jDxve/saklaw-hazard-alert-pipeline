export interface FloodBulletin {
  isRedAlert: boolean;
  isOrangeAlert: boolean;
}

export interface FloodSource {
  fetchActiveFloodBulletin(): Promise<FloodBulletin | null>;
}
