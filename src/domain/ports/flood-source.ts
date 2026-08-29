export interface RiverBasinStatus {
  /** Basin name as PAGASA publishes it, e.g. "Pampanga", "Angat Sub-basin". */
  name: string;
  /** Link to that basin's own PDF bulletin, where the detailed forecast lives. */
  bulletinUrl: string | null;
}

export interface FloodBulletin {
  /** Only the basins currently raised to flood watch. Never empty. */
  basinsOnWatch: readonly RiverBasinStatus[];
  /** How many basins the table listed, so "5 of 22" can be reported honestly. */
  basinsMonitored: number;
}

export interface FloodSource {
  /**
   * Returns null when no basin is on flood watch, or when the bulletin could
   * not be read. The two are logged differently: an unreadable page must not
   * be reported to users as an all-clear.
   */
  fetchActiveFloodBulletin(): Promise<FloodBulletin | null>;
}
