export interface GisManifest {
  commitSha: string;
  lastModified: string;
  updatedAt: string;
  pmtilesUrl: string;
  layers: readonly string[];
}

export interface GisManifestRepository {
  getCurrentCommitSha(): Promise<string | null>;
  save(manifest: GisManifest): Promise<void>;
}
