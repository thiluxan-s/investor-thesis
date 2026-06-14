import { z } from "zod";
import { EVIDENCE_IMPACTS } from "@/schemas/evidence";

export const EvaluationSchema = z.object({
  impact: z.enum(EVIDENCE_IMPACTS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export type EvaluationResult = z.infer<typeof EvaluationSchema>;
