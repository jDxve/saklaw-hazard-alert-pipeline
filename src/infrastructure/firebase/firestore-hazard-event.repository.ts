import type { Firestore } from "firebase-admin/firestore";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository, HazardQuery } from "../../domain/ports/hazard-event.repository";
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

  async findRecent(query: HazardQuery): Promise<HazardEvent[]> {
    let ref = this.db
      .collection(this.collection)
      .where("issuedAt", ">=", query.since)
      .orderBy("issuedAt", "desc")
      .limit(query.limit);

    // Firestore allows one `in` per query and caps it at 30 values; the hazard
    // type union is far smaller, so a single filter covers every combination.
    if (query.types.length > 0) {
      ref = ref.where("type", "in", [...query.types]) as typeof ref;
    }

    const snapshot = await ref.get();
    return snapshot.docs.map((doc) => doc.data() as HazardEvent);
  }

  async findById(id: string): Promise<HazardEvent | null> {
    const snapshot = await this.db.collection(this.collection).doc(id).get();
    return snapshot.exists ? (snapshot.data() as HazardEvent) : null;
  }
}
