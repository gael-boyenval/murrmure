import type { ArtifactService } from "./artifact-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function registerArtifactGcCron(artifactService: ArtifactService): () => void {
  const timer = setInterval(() => {
    void artifactService.runGc().catch(() => undefined);
  }, DAY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
