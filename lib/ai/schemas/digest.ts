import { z } from "zod";

export const DigestSchema = z.object({
  theses: z.array(
    z.object({
      thesisId: z.string().min(1),
      blurb: z.string().min(1),
    }),
  ),
});

export type DigestResult = z.infer<typeof DigestSchema>;
