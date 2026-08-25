import { HazardEvent } from "../entities/hazard-event";

export interface HazardEventRepository {
  exists(id: string): Promise<boolean>;
  save(event: HazardEvent): Promise<void>;
}
