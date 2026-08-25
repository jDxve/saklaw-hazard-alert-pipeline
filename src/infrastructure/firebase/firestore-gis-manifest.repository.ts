import type { Firestore } from "firebase-admin/firestore";
import { GisManifest, GisManifestRepository } from "../../domain/ports/gis-manifest.repository";

const MANIFEST_COLLECTION = "layer_manifest";
const MANIFEST_DOC_ID = "noah_gis";

export class FirestoreGisManifestRepository implements GisManifestRepository {
  constructor(private readonly db: Firestore) {}

  async getCurrentCommitSha(): Promise<string | null> {
    const snapshot = await this.docRef().get();
    return snapshot.exists ? (snapshot.data()?.commitSha ?? null) : null;
  }

  async save(manifest: GisManifest): Promise<void> {
    await this.docRef().set(manifest);
  }

  private docRef() {
    return this.db.collection(MANIFEST_COLLECTION).doc(MANIFEST_DOC_ID);
  }
}
