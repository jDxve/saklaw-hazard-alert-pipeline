import { z } from "zod";
import { GisDatasetRevision, GisDatasetSource } from "../../domain/ports/gis-dataset-source";
import { HttpClient } from "../http/http-client";

const huggingFaceDatasetResponseSchema = z.object({
  sha: z.string().optional(),
  lastCommit: z.string().optional(),
  lastModified: z.string().optional(),
});

export class HuggingFaceNoahDatasetSource implements GisDatasetSource {
  constructor(
    private readonly http: HttpClient,
    private readonly apiUrl: string,
  ) {}

  async fetchLatestRevision(): Promise<GisDatasetRevision | null> {
    const raw = await this.http.getJson<unknown>(this.apiUrl);
    const data = huggingFaceDatasetResponseSchema.parse(raw);
    const commitSha = data.sha ?? data.lastCommit;
    if (!commitSha) return null;

    return { commitSha, lastModified: data.lastModified ?? new Date().toISOString() };
  }
}
