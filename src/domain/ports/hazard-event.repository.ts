import { HazardEvent } from "../entities/hazard-event";

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
}
