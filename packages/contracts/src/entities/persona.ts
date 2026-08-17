import { z } from "zod";

/** Space-local persona id. Not a principal; two spaces may share the same id. */
export const PersonaIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/, "Expected persona id ^[a-z][a-z0-9_-]{0,63}$");

/** Catalog ad. Prompts, skills, and harness stay out of this file. */
export const PersonaAdSchema = z.object({
  id: PersonaIdSchema,
  summary: z.string().min(1),
  asks: z.array(z.string()).optional(),
  requests: z.array(z.string()).optional(),
});

export const PersonasFileSchema = z
  .object({
    version: z.literal(1),
    personas: z.array(PersonaAdSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < file.personas.length; i++) {
      const id = file.personas[i]!.id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate persona id '${id}'`,
          path: ["personas", i, "id"],
        });
      }
      seen.add(id);
    }
  });

export type PersonaId = z.infer<typeof PersonaIdSchema>;
export type PersonaAd = z.infer<typeof PersonaAdSchema>;
export type PersonasFile = z.infer<typeof PersonasFileSchema>;
