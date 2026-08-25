export interface GisDatasetRevision {
  commitSha: string;
  lastModified: string;
}

export interface GisDatasetSource {
  fetchLatestRevision(): Promise<GisDatasetRevision | null>;
}
