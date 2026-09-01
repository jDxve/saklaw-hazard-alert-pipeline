export interface GisManifest {
  commitSha: string;
  lastModified: string;
  updatedAt: string;
  pmtilesUrl: string;
  layers: readonly string[];
}

export interface GisManifestRepository {
  /**
   * Stores the manifest only if the recorded commit differs, atomically.
   * Returns true when the manifest advanced, false when it was already current.
   *
   * The daily poll and the Hugging Face webhook are separate functions that can
   * observe the same new commit at the same time; without atomicity both would
   * conclude "new revision" and broadcast a duplicate OTA update.
   */
  saveIfCommitChanged(manifest: GisManifest): Promise<boolean>;

  /** The manifest as last recorded, or null before the first sync has run. */
  findCurrent(): Promise<GisManifest | null>;
}
