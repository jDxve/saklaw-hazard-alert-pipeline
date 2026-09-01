import type { Firestore } from "firebase-admin/firestore";
import { GisManifest, GisManifestRepository } from "../../domain/ports/gis-manifest.repository";

const MANIFEST_COLLECTION = "layer_manifest";
const MANIFEST_DOC_ID = "noah_gis";

export class FirestoreGisManifestRepository implements GisManifestRepository {
  constructor(private readonly db: Firestore) {}

  async saveIfCommitChanged(manifest: GisManifest): Promise<boolean> {
    const ref = this.db.collection(MANIFEST_COLLECTION).doc(MANIFEST_DOC_ID);

    // The compare and the write share one transaction, so a concurrent
    // webhook and daily poll cannot both decide the revision is new.
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists && snapshot.data()?.commitSha === manifest.commitSha) {
        return false;
      }
      tx.set(ref, manifest);
      return true;
    });
  }

  async findCurrent(): Promise<GisManifest | null> {
    const snapshot = await this.db.collection(MANIFEST_COLLECTION).doc(MANIFEST_DOC_ID).get();
    return snapshot.exists ? (snapshot.data() as GisManifest) : null;
  }
}
