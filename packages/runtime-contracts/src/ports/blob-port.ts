export interface BlobRef {
  blob_id: string;
  digest: string;
  media_type: string;
}

export interface BlobPort {
  read(
    ref: BlobRef,
    ctx: { actor_id: string; credential_id: string; scope_id: string },
  ): Promise<unknown>;
  write(
    data: unknown,
    ctx: { actor_id: string; credential_id: string; scope_id: string; media_type: string },
  ): Promise<BlobRef>;
  delete(ref: BlobRef, ctx: { actor_id: string; credential_id: string }): Promise<void>;
}
