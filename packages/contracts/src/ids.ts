import { z } from "zod";

const ULID_PATTERN = "[0-9A-HJKMNP-TV-Z]{26}";

export function PrefixedIdSchema(prefix: string) {
  return z.string().regex(
    new RegExp(`^${prefix}_${ULID_PATTERN}$`),
    `Expected ${prefix}_<ULID>`,
  );
}

export const SpaceIdSchema = PrefixedIdSchema("spc");
/** @deprecated Prefer RunIdSchema — rev-1 renames Instance → Run */
export const InstanceIdSchema = PrefixedIdSchema("ins");
export const RunIdSchema = PrefixedIdSchema("run");
export const SessionIdSchema = PrefixedIdSchema("ses");
export const FlowIdSchema = PrefixedIdSchema("flw");
export const TransferIdSchema = PrefixedIdSchema("xfr");
export const TokenIdSchema = PrefixedIdSchema("tok");
export const GrantIdSchema = PrefixedIdSchema("grt");
export const EventIdSchema = PrefixedIdSchema("evt");
export const GateIdSchema = PrefixedIdSchema("chk");
export const TriggerIdSchema = PrefixedIdSchema("trg");
export const HubIdSchema = PrefixedIdSchema("hub");
export const BlobIdSchema = PrefixedIdSchema("blb");

/** Map v1 instance id (`ins_*`) to rev-1 run id (`run_*`). */
export function instanceIdToRunId(id: string): string {
  return id.startsWith("ins_") ? `run_${id.slice(4)}` : id;
}

export type SpaceId = z.infer<typeof SpaceIdSchema>;
/** @deprecated Prefer RunId */
export type InstanceId = z.infer<typeof InstanceIdSchema>;
export type RunId = z.infer<typeof RunIdSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type FlowId = z.infer<typeof FlowIdSchema>;
export type TransferId = z.infer<typeof TransferIdSchema>;
export type TokenId = z.infer<typeof TokenIdSchema>;
