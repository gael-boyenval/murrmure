import { z } from "zod";

export const RuleRefSchema = z.object({
  rule_ref_id: z.string(),
  digest: z.string(),
  version: z.string(),
});

export const RuleArtifactSchema = z
  .object({
    schema_version: z.enum(["1.0", "0.9"]),
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
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        event: z.string(),
        actors: z.array(z.string()),
        condition: z.string().nullable(),
        checkpoint: z
          .object({
            quorum: z.enum(["any", "all", "count"]),
            count: z.number().default(1),
            assignees: z.array(z.string()),
            reject_requires_quorum: z.boolean().optional(),
          })
          .nullable(),
        emit: z.array(z.string()).default([]),
      }),
    ),
    events: z
      .object({
        declarations: z.array(
          z.object({
            type: z.string(),
            schema: z.record(z.unknown()),
          }),
        ),
      })
      .optional(),
    convergence: z
      .object({
        evaluate_on: z.array(z.string()),
        rules: z.array(z.unknown()),
      })
      .optional(),
    checkpoints: z
      .object({
        assignee_resolver: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type RuleArtifactParsed = z.infer<typeof RuleArtifactSchema>;

export const ProvenanceSchema = z.object({
  scope_id: z.string(),
  actor_id: z.string(),
  credential_id: z.string(),
  aggregate_id: z.string().optional(),
  command_id: z.string().optional(),
  actor_kind: z.enum(["human", "agent", "system"]).optional(),
});

export const CommandResultSchema = z.object({
  outcome: z.enum(["success", "denial"]),
  http_semantic: z.union([
    z.literal(200),
    z.literal(202),
    z.literal(400),
    z.literal(403),
    z.literal(404),
    z.literal(409),
  ]),
  code: z.string(),
  body: z.record(z.unknown()),
  journal_entry_id: z.string().optional(),
  seq: z.number().optional(),
});
