import type { Firestore } from "firebase-admin/firestore";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { isAlreadyExistsError } from "./firestore-errors";

export class FirestoreHazardEventRepository implements HazardEventRepository {
  constructor(
    private readonly db: Firestore,
    private readonly collection: string,
  ) {}

  async saveIfAbsent(event: HazardEvent): Promise<boolean> {
    try {
      // `create` fails if the document exists, which makes this a single
      // atomic write — and costs one less Firestore read per observation
      // than reading the document back before every save.
      await this.db.collection(this.collection).doc(event.id).create(event);
      return true;
    } catch (err) {
      if (isAlreadyExistsError(err)) return false;
      throw err;
    }
  }
}
