/** Returns true when the reader may access the artifact manifest. */
export function isArtifactReaderAuthorized(
  authorizedReaders: string[],
  spaceId: string,
  actorId: string,
): boolean {
  if (authorizedReaders.length === 0) return false;
  const prefixed = spaceId.startsWith("spc_") ? spaceId : `spc_${spaceId}`;
  const bare = spaceId.startsWith("spc_") ? spaceId.slice(4) : spaceId;
  for (const reader of authorizedReaders) {
    if (reader === prefixed || reader === bare || reader === spaceId) {
      return true;
    }
    if (reader === `actor:${actorId}` || reader === actorId) {
      return true;
    }
  }
  return false;
}
