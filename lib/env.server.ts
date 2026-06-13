import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),
  // AI / agent fields — optional so the app boots without them during non-agent
  // requests (e.g. thesis CRUD). Agent functions guard their own usage.
  ANTHROPIC_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  // SEC asks for a contact in the User-Agent. Set the real one (with a contact
  // email) via the EDGAR_USER_AGENT env var in .env.local / deployment — never
  // hardcode personal contact info here, since this file is committed.
  EDGAR_USER_AGENT: z.string().default("thesis-tracker/1.0"),
  // Set to "1" to replay fixtures instead of hitting real APIs.
  USE_AI_FIXTURES: z.boolean(),
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  EDGAR_USER_AGENT: process.env.EDGAR_USER_AGENT,
  USE_AI_FIXTURES: process.env.USE_AI_FIXTURES === "1",
});
