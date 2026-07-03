import { z } from "zod";

export const EventPayloadPropertySchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
});

export const EventPayloadSchemaSchema = z.object({
  required: z.array(z.string()).optional(),
  properties: z.record(EventPayloadPropertySchema).optional(),
});

export const EventDeclarationSchema = z.object({
  description: z.string().optional(),
  payload: EventPayloadSchemaSchema.optional(),
});

export const EventsFileSchema = z.object({
  version: z.literal(1),
  events: z.record(EventDeclarationSchema),
});

export type EventPayloadProperty = z.infer<typeof EventPayloadPropertySchema>;
export type EventPayloadSchema = z.infer<typeof EventPayloadSchemaSchema>;
export type EventDeclaration = z.infer<typeof EventDeclarationSchema>;
export type EventsFile = z.infer<typeof EventsFileSchema>;
