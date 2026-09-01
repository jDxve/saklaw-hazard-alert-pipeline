import { HazardEvent, HazardType } from "../entities/hazard-event";

export interface HazardQuery {
  /** Empty means every type. */
  types: readonly HazardType[];
  /** Only events issued at or after this instant. */
  since: string;
  limit: number;
}

export interface HazardEventRepository {
  /**
   * Persists the event only if its id is not already taken, atomically.
   * Returns true when this call created it, false when it already existed.
   *
   * Deduplication is expressed as one operation rather than an `exists` check
   * followed by a `save`: between those two calls a concurrent invocation can
   * pass the same check, and both would then save and push the same alert.
   */
  saveIfAbsent(event: HazardEvent): Promise<boolean>;

  /**
   * Most recently issued events first.
   *
   * Time and type are filtered in the query because Firestore can index them.
   * Location cannot be — the store holds no geohash — so the read API narrows
   * by place in memory over this bounded window.
   */
  findRecent(query: HazardQuery): Promise<HazardEvent[]>;

  findById(id: string): Promise<HazardEvent | null>;
}
