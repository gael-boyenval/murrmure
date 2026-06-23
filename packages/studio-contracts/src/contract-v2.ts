import { z } from "zod";

export const ContractV2Schema = z
  .object({
    schemaVersion: z.literal("2.0"),
    id: z.string(),
    version: z.string(),
    initial_state: z.string(),
    terminal_states: z.array(z.string()),
    metadata_schema: z.record(z.unknown()).default({}),
    states: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["active", "terminal", "archived"]).optional(),
      }),
    ),
    transitions: z.array(
      z
        .object({
          id: z.string(),
          from: z.string().nullable(),
          to: z.string(),
          event: z.string(),
          actors: z.array(z.string()),
          condition: z.string().nullable().default(null),
          gate: z
            .union([
              z.object({
                mode: z.enum(["any", "all", "count"]),
                count: z.number().optional(),
                assignees: z.array(z.string()),
              }),
              z.record(z.unknown()),
            ])
            .nullable()
            .default(null),
          emit: z.array(z.string()).default([]),
        })
        .passthrough(),
    ),
    events: z
      .object({
        declarations: z.array(
          z
            .object({
              type: z.string(),
              schema: z.record(z.unknown()).optional(),
              payload_schema: z.record(z.unknown()).optional(),
            })
            .passthrough(),
        ),
      })
      .optional(),
  })
  .passthrough();

export type ContractV2 = z.infer<typeof ContractV2Schema>;
