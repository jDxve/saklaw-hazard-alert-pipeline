import type { Firestore } from "firebase-admin/firestore";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";

export class FirestoreHazardEventRepository implements HazardEventRepository {
  constructor(
    private readonly db: Firestore,
    private readonly collection: string,
  ) {}

  async exists(id: string): Promise<boolean> {
    const snapshot = await this.db.collection(this.collection).doc(id).get();
    return snapshot.exists;
  }

  async save(event: HazardEvent): Promise<void> {
    await this.db.collection(this.collection).doc(event.id).set(event);
  }
}
