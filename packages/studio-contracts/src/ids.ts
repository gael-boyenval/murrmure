import { z } from "zod";

const ULID_PATTERN = "[0-9A-HJKMNP-TV-Z]{26}";

export function PrefixedIdSchema(prefix: string) {
  return z.string().regex(
    new RegExp(`^${prefix}_${ULID_PATTERN}$`),
    `Expected ${prefix}_<ULID>`,
  );
}

export const SpaceIdSchema = PrefixedIdSchema("spc");
export const InstanceIdSchema = PrefixedIdSchema("ins");
export const TokenIdSchema = PrefixedIdSchema("tok");
export const GrantIdSchema = PrefixedIdSchema("grt");
export const EventIdSchema = PrefixedIdSchema("evt");
export const GateIdSchema = PrefixedIdSchema("chk");
export const TriggerIdSchema = PrefixedIdSchema("trg");
export const HubIdSchema = PrefixedIdSchema("hub");
export const BlobIdSchema = PrefixedIdSchema("blb");

export type SpaceId = z.infer<typeof SpaceIdSchema>;
export type InstanceId = z.infer<typeof InstanceIdSchema>;
export type TokenId = z.infer<typeof TokenIdSchema>;
