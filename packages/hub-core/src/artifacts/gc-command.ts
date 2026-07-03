export interface ArtifactGcCandidate {
  transfer_id: string;
  source_space_id: string;
  hold: boolean;
  expires_at: string;
}

export interface ArtifactGcResult {
  eligible: ArtifactGcCandidate[];
  skipped_held: string[];
}

/** Pure eligibility logic for artifact GC (rev-1 §7.4). */
export function selectArtifactsForGc(
  artifacts: ArtifactGcCandidate[],
  now = new Date(),
): ArtifactGcResult {
  const eligible: ArtifactGcCandidate[] = [];
  const skipped_held: string[] = [];
  const nowMs = now.getTime();

  for (const artifact of artifacts) {
    if (artifact.hold) {
      skipped_held.push(artifact.transfer_id);
      continue;
    }
    if (new Date(artifact.expires_at).getTime() <= nowMs) {
      eligible.push(artifact);
    }
  }

  return { eligible, skipped_held };
}
