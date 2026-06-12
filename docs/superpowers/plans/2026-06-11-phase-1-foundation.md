# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js 15 app where a user signs in via Clerk and sees an empty `/theses` dashboard, backed by Neon Postgres (pgvector enabled) through Drizzle, with split Zod-validated env and the repository pattern in place.

**Architecture:** Next.js 15 App Router (no `src/` dir). Clerk owns identity; a thin `users` row is keyed by `clerk_user_id`, created via a Svix-verified webhook in production and a lazy idempotent fallback locally. All DB access flows through `lib/db/repositories/`. Env is split into server/client modules, each Zod-parsed at load so the app refuses to boot misconfigured.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind v4 + shadcn/ui (new-york, zinc), Drizzle ORM + `@neondatabase/serverless`, Clerk (`@clerk/nextjs`), Zod, Geist fonts, Vitest (unit tests for pure logic).

---

## Deviations from the design spec (current-library reality)

These refine `docs/superpowers/specs/2026-06-11-phase-1-foundation-design.md` based on Context7 verification:

1. **Webhook uses `verifyWebhook()` from `@clerk/nextjs/webhooks`** (wraps Svix). We do **not** add a direct `svix` dependency.
2. **Webhook secret env var is `CLERK_WEBHOOK_SIGNING_SECRET`** (the name `verifyWebhook` expects), not `CLERK_WEBHOOK_SECRET`.
3. **Two new dev dependencies** beyond the locked stack + approved `geist`: **`dotenv`** (so drizzle-kit reads `.env.local`) and **`vitest`** (to TDD the webhook event-dispatch logic). Both require approval at the install step.

## New dependencies (require approval before the install commit)

- Runtime: `@clerk/nextjs`, `drizzle-orm`, `@neondatabase/serverless`, `zod`, `geist`
- Dev: `drizzle-kit`, `dotenv`, `vitest`
- Added by `shadcn add`: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `tw-animate-css` (+ Radix primitives as needed)

## File map

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Root layout: Geist fonts, `<ClerkProvider>`, `<Toaster>` |
| `app/page.tsx` | Landing page (split hero + how-it-works) |
| `app/globals.css` | Tailwind v4 theme + locked design tokens |
| `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Clerk `<SignIn />` |
| `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Clerk `<SignUp />` |
| `app/(app)/layout.tsx` | Protected layout: `ensureUserExists()`, top nav with `<UserButton />` |
| `app/(app)/theses/page.tsx` | Empty state |
| `app/api/clerk/webhook/route.ts` | Verify webhook, delegate to `handleUserEvent` |
| `middleware.ts` | `clerkMiddleware` protecting `(app)/*` |
| `lib/env.server.ts` | Server env, Zod-parsed at load |
| `lib/env.client.ts` | `NEXT_PUBLIC_*` env, Zod-parsed at load |
| `lib/db/index.ts` | Drizzle client over Neon |
| `lib/db/schema.ts` | `users` table |
| `lib/db/repositories/users.ts` | All `users` access |
| `lib/clerk/handle-user-event.ts` | Pure event→action dispatch (unit-tested) |
| `lib/clerk/handle-user-event.test.ts` | Vitest unit tests |
| `lib/clerk/ensure-user.ts` | Lazy idempotent user creation |
| `drizzle.config.ts` | drizzle-kit config |
| `.env.example` | All required vars |
| `README.md` | Current-state project description |

---

## Task 1: Scaffold Next.js 15 app

**Files:** Create the project in-place (repo root already has `docs/`, `CLAUDE.md`, `.gitignore`).

- [ ] **Step 1: Scaffold into a temp dir, then move files in** (create-next-app won't run in a non-empty dir)

```bash
cd /home/thiluxan_s
npx create-next-app@latest itx-scaffold \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-npm --turbopack
# Move generated files into the repo (keep existing docs/, CLAUDE.md, .gitignore)
rsync -a --remove-source-files \
  --exclude '.git' --exclude '.gitignore' --exclude 'README.md' \
  itx-scaffold/ /home/thiluxan_s/InvestorThesis/
rm -rf itx-scaffold
cd /home/thiluxan_s/InvestorThesis
```

- [ ] **Step 2: Set `package.json` name and add scripts**

Edit `package.json`: set `"name": "thesis-tracker"`, and ensure scripts include:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  }
}
```

- [ ] **Step 3: Confirm `tsconfig.json` strict mode**

Ensure `"strict": true` is set (create-next-app default). Confirm `"paths": { "@/*": ["./*"] }`.

- [ ] **Step 4: Verify it boots**

Run: `npm run dev`
Expected: `localhost:3000` serves the default Next page with no errors. Stop the server.

- [ ] **Step 5: Verify typecheck/lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with TypeScript and Tailwind"
```

---

## Task 2: Install dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install @clerk/nextjs drizzle-orm @neondatabase/serverless zod geist
npm install -D drizzle-kit dotenv vitest
```

- [ ] **Step 2: Verify install**

Run: `npm run typecheck`
Expected: passes (no usage yet, just confirms install didn't break types).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add core dependencies (clerk, drizzle, neon, zod, geist, vitest)"
```

---

## Task 3: Initialize shadcn/ui and base components

**Files:** Create `components.json`, `components/ui/*`, `lib/utils.ts`; modify `app/globals.css`.

- [ ] **Step 1: Init shadcn (new-york style, zinc base, CSS variables)**

```bash
npx shadcn@latest init --defaults --base-color zinc
```
This writes `components.json` (style `new-york`, baseColor `zinc`, cssVariables `true`, css `app/globals.css`, alias `@/components`) and `lib/utils.ts`. If the CLI version rejects a flag, run `npx shadcn@latest init` and answer the prompts: **new-york** style, **zinc** base color, **yes** to CSS variables.

- [ ] **Step 2: Add the base components**

```bash
npx shadcn@latest add button card input label sonner
```
Expected: files created under `components/ui/`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: init shadcn/ui (new-york, zinc) with base components"
```

---

## Task 4: Apply locked design tokens

**Files:** Modify `app/globals.css`; modify `docs/DESIGN.md`.

- [ ] **Step 1: Add brand + health tokens to `app/globals.css`**

Inside the existing `:root` block (light theme), add custom tokens and map `--primary` to the deep-blue accent. Append:

```css
:root {
  /* Brand accent — deep blue (Direction A) */
  --primary: oklch(0.31 0.06 250); /* ≈ #1E3A5F */
  --primary-foreground: oklch(0.985 0 0);

  /* Thesis-health semantic colors (warm/earthy, Direction A + H2) */
  --health-strong: oklch(0.55 0.11 150);  /* ≈ #1F7A4D */
  --health-neutral: oklch(0.71 0.01 286); /* zinc-400 ≈ #A1A1AA */
  --health-weak: oklch(0.53 0.15 35);     /* ≈ #C0492F */
}

@theme inline {
  --color-health-strong: var(--health-strong);
  --color-health-neutral: var(--health-neutral);
  --color-health-weak: var(--health-weak);
}
```

- [ ] **Step 2: Wire Geist fonts in `app/layout.tsx`**

Replace the create-next-app font setup with Geist:

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thesis Tracker",
  description: "An AI agent that watches the world for evidence that strengthens or weakens your investment thesis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

Note: `<ClerkProvider>` and `<Toaster>` are added in Task 8 / Task 3 follow-up — for now keep the body simple. (Toaster is wired in Task 9.)

- [ ] **Step 3: Map font CSS variables in `app/globals.css`**

In the `@theme inline` block, ensure:

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

- [ ] **Step 4: Record the decision in `docs/DESIGN.md`**

Replace the "TBD — finalize Phase 1" notes in the Color palette and Typography sections with the final values, and add a Decisions-log entry (newest first):

```markdown
- 2026-06-11 — Design direction "A · Graphite & Deep Blue". Accent `#1E3A5F` (deep blue, lower saturation than `blue-700`). Neutrals: Zinc. Health colors warm/earthy (H2): strengthening `#1F7A4D`, neutral `#A1A1AA`, weakening `#C0492F` — dialed down from kelly-green/fire-engine-red to read "considered." Type: Geist Sans (UI/body) + Geist Mono (tickers, scores). Landing: asymmetric split hero, light theme.
```

- [ ] **Step 5: Verify build picks up tokens**

Run: `npm run dev`, open `localhost:3000`. Expected: no CSS errors in console. Stop server. Run `npm run typecheck` → passes.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx docs/DESIGN.md
git commit -m "feat: apply locked design tokens and Geist fonts"
```

---

## Task 5: Env validation (split server/client)

**Files:** Create `lib/env.server.ts`, `lib/env.client.ts`.

- [ ] **Step 1: Write `lib/env.server.ts`**

```ts
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
});
```

- [ ] **Step 2: Write `lib/env.client.ts`**

```ts
import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
});

// Reference each var statically so Next.js inlines it at build time.
export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});
```

- [ ] **Step 3: Install `server-only`** (tiny Next helper, ships with Next but ensure present)

```bash
npm ls server-only || npm install server-only
```

- [ ] **Step 4: Add a `.env.local` for local dev** (gitignored — do NOT commit)

Create `.env.local` with real values from Neon + Clerk (filled during Task 11 setup). For now placeholders are fine to let typecheck pass:

```env
DATABASE_URL=postgresql://placeholder
CLERK_SECRET_KEY=sk_test_placeholder
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
CLERK_WEBHOOK_SIGNING_SECRET=placeholder
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit** (only the two source files — `.env.local` is gitignored)

```bash
git add lib/env.server.ts lib/env.client.ts
git commit -m "feat: add split Zod-validated env (server/client)"
```

---

## Task 6: Drizzle schema, client, and migrations (pgvector enabled)

**Files:** Create `lib/db/schema.ts`, `lib/db/index.ts`, `drizzle.config.ts`; generate `drizzle/*`.

- [ ] **Step 1: Write `lib/db/schema.ts`**

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Write `lib/db/index.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { serverEnv } from "@/lib/env.server";
import * as schema from "./schema";

const sql = neon(serverEnv.DATABASE_URL);
export const db = drizzle({ client: sql, schema });
```

- [ ] **Step 3: Write `drizzle.config.ts`** (loads `.env.local` via dotenv)

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Generate the users-table migration**

Run: `npm run db:generate`
Expected: a file `drizzle/0000_*.sql` is created defining the `users` table.

- [ ] **Step 5: Add pgvector extension to the generated migration**

Open the generated `drizzle/0000_*.sql` and add as the **first line**, before any `CREATE TABLE`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
```

(Editing a not-yet-applied migration is allowed; never edit after applying.)

- [ ] **Step 6: Apply the migration** (requires a real `DATABASE_URL` in `.env.local` — see Task 11; if Neon not yet provisioned, defer this step and run after Task 11 Step 2)

Run: `npm run db:migrate`
Expected: migration applies; `users` table and `vector` extension exist in Neon.

- [ ] **Step 7: Verify**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/index.ts drizzle.config.ts drizzle/
git commit -m "feat: add Drizzle users schema, Neon client, and pgvector migration"
```

---

## Task 7: Users repository

**Files:** Create `lib/db/repositories/users.ts`.

- [ ] **Step 1: Write `lib/db/repositories/users.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return row ?? null;
}

export async function createUserFromClerk(input: {
  clerkUserId: string;
  email: string;
}): Promise<User | null> {
  const [row] = await db
    .insert(users)
    .values({ clerkUserId: input.clerkUserId, email: input.email })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  return row ?? null;
}

export async function updateUserEmail(input: {
  clerkUserId: string;
  email: string;
}): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ email: input.email })
    .where(eq(users.clerkUserId, input.clerkUserId))
    .returning();
  return row ?? null;
}

export async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/db/repositories/users.ts
git commit -m "feat: add users repository"
```

---

## Task 8: Clerk wiring — provider, middleware, auth pages

**Files:** Modify `app/layout.tsx`; create `middleware.ts`, `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`.

- [ ] **Step 1: Wrap the app in `<ClerkProvider>`** (modify `app/layout.tsx`)

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thesis Tracker",
  description: "An AI agent that watches the world for evidence that strengthens or weakens your investment thesis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Write `middleware.ts`** (protect `(app)` routes; everything else public)

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/theses(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 3: Write `app/(auth)/sign-in/[[...sign-in]]/page.tsx`**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 4: Write `app/(auth)/sign-up/[[...sign-up]]/page.tsx`**

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 5: Add Clerk URL env vars to `.env.local`** (and later `.env.example` in Task 12)

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/theses
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/theses
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: build succeeds. (With real Clerk keys in `.env.local`, `npm run dev` → visiting `/sign-in` shows Clerk's component.)

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx middleware.ts "app/(auth)"
git commit -m "feat: wire Clerk provider, middleware, and auth pages"
```

---

## Task 9: Clerk webhook with tested event dispatch

**Files:** Create `lib/clerk/handle-user-event.ts`, `lib/clerk/handle-user-event.test.ts`, `app/api/clerk/webhook/route.ts`, `vitest.config.ts`.

- [ ] **Step 1: Add `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test `lib/clerk/handle-user-event.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { handleUserEvent, type UserSync } from "./handle-user-event";

function makeSync(): UserSync {
  return {
    createUserFromClerk: vi.fn().mockResolvedValue(null),
    updateUserEmail: vi.fn().mockResolvedValue(null),
    deleteUserByClerkId: vi.fn().mockResolvedValue(undefined),
  };
}

const userData = {
  id: "user_123",
  email_addresses: [
    { id: "idn_1", email_address: "primary@example.com" },
    { id: "idn_2", email_address: "other@example.com" },
  ],
  primary_email_address_id: "idn_1",
};

describe("handleUserEvent", () => {
  it("creates a user on user.created using the primary email", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "user.created", data: userData } as never, sync);
    expect(sync.createUserFromClerk).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      email: "primary@example.com",
    });
    expect(result).toEqual({ status: "handled", action: "created" });
  });

  it("updates email on user.updated", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "user.updated", data: userData } as never, sync);
    expect(sync.updateUserEmail).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      email: "primary@example.com",
    });
    expect(result).toEqual({ status: "handled", action: "updated" });
  });

  it("deletes on user.deleted", async () => {
    const sync = makeSync();
    const result = await handleUserEvent(
      { type: "user.deleted", data: { id: "user_123" } } as never,
      sync,
    );
    expect(sync.deleteUserByClerkId).toHaveBeenCalledWith("user_123");
    expect(result).toEqual({ status: "handled", action: "deleted" });
  });

  it("ignores unhandled event types", async () => {
    const sync = makeSync();
    const result = await handleUserEvent({ type: "session.created", data: {} } as never, sync);
    expect(sync.createUserFromClerk).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ignored", eventType: "session.created" });
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test`
Expected: FAIL — `handle-user-event.ts` does not exist.

- [ ] **Step 4: Write `lib/clerk/handle-user-event.ts`**

```ts
import type { WebhookEvent } from "@clerk/nextjs/server";

export type UserEventResult =
  | { status: "handled"; action: "created" | "updated" | "deleted" }
  | { status: "ignored"; eventType: string };

export interface UserSync {
  createUserFromClerk(input: { clerkUserId: string; email: string }): Promise<unknown>;
  updateUserEmail(input: { clerkUserId: string; email: string }): Promise<unknown>;
  deleteUserByClerkId(clerkUserId: string): Promise<unknown>;
}

function primaryEmail(data: {
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}): string {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address ?? "";
}

export async function handleUserEvent(
  evt: WebhookEvent,
  sync: UserSync,
): Promise<UserEventResult> {
  switch (evt.type) {
    case "user.created": {
      await sync.createUserFromClerk({ clerkUserId: evt.data.id, email: primaryEmail(evt.data) });
      return { status: "handled", action: "created" };
    }
    case "user.updated": {
      await sync.updateUserEmail({ clerkUserId: evt.data.id, email: primaryEmail(evt.data) });
      return { status: "handled", action: "updated" };
    }
    case "user.deleted": {
      if (evt.data.id) await sync.deleteUserByClerkId(evt.data.id);
      return { status: "handled", action: "deleted" };
    }
    default:
      return { status: "ignored", eventType: evt.type };
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Write `app/api/clerk/webhook/route.ts`**

```ts
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { handleUserEvent } from "@/lib/clerk/handle-user-event";
import {
  createUserFromClerk,
  updateUserEmail,
  deleteUserByClerkId,
} from "@/lib/db/repositories/users";

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const result = await handleUserEvent(evt, {
    createUserFromClerk,
    updateUserEmail,
    deleteUserByClerkId,
  });

  if (result.status === "ignored") {
    return Response.json({ ignored: true, eventType: result.eventType }, { status: 200 });
  }
  return Response.json({ ok: true, action: result.action }, { status: 200 });
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add lib/clerk/handle-user-event.ts lib/clerk/handle-user-event.test.ts app/api/clerk/webhook/route.ts vitest.config.ts
git commit -m "feat: add Clerk webhook with tested user-event dispatch"
```

---

## Task 10: Protected layout, lazy user creation, nav

**Files:** Create `lib/clerk/ensure-user.ts`, `app/(app)/layout.tsx`; modify `app/layout.tsx` (Toaster).

- [ ] **Step 1: Write `lib/clerk/ensure-user.ts`**

```ts
import { currentUser } from "@clerk/nextjs/server";
import { createUserFromClerk } from "@/lib/db/repositories/users";

/**
 * Idempotent fallback for the webhook: ensures the signed-in Clerk user has a
 * local `users` row. Safe to call on every protected request — insert is
 * on-conflict-do-nothing.
 */
export async function ensureUserExists(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";
  await createUserFromClerk({ clerkUserId: user.id, email });
}
```

- [ ] **Step 2: Add `<Toaster>` to root layout** (modify `app/layout.tsx` body)

```tsx
import { Toaster } from "@/components/ui/sonner";
// ...inside <body>, after {children}:
        <body className="font-sans antialiased">
          {children}
          <Toaster />
        </body>
```

- [ ] **Step 3: Write `app/(app)/layout.tsx`** (protected; nav with UserButton)

```tsx
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureUserExists } from "@/lib/clerk/ensure-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureUserExists();
  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-3.5">
        <Link href="/theses" className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="size-[18px] rounded-[5px] bg-primary" />
          Thesis Tracker
        </Link>
        <UserButton />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add lib/clerk/ensure-user.ts app/layout.tsx "app/(app)/layout.tsx"
git commit -m "feat: protected app layout with lazy user creation and nav"
```

---

## Task 11: External services + apply migration (interactive setup)

**Note:** These steps need the user's dashboards. The implementing agent should pause and ask the user to perform the dashboard actions, then continue. Local sign-up/login interactive commands can be run with the `! <command>` prompt prefix.

- [ ] **Step 1: User provisions services**
  - **Neon:** create project → copy pooled `DATABASE_URL`.
  - **Clerk:** create application → copy `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Enable Email sign-up.
  - Put all real values in `.env.local` (replace Task 5 placeholders). Leave `CLERK_WEBHOOK_SIGNING_SECRET=placeholder` until the production endpoint exists (Task 13).

- [ ] **Step 2: Apply the migration to Neon** (the deferred Task 6 Step 6)

Run: `npm run db:migrate`
Expected: `users` table + `vector` extension created. Verify in Neon SQL editor: `SELECT * FROM pg_extension WHERE extname = 'vector';` returns a row.

- [ ] **Step 3: Smoke-test auth locally**

Run: `npm run dev`. Sign up with a test email. Confirm:
  - Redirect to `/theses` after sign-up.
  - A `users` row exists in Neon (created lazily by `ensureUserExists`).
  - Visiting `/theses` while signed out redirects to `/sign-in`.

No commit (no code change); this is verification.

---

## Task 12: `/theses` empty state and landing page

**Files:** Create `app/(app)/theses/page.tsx`, replace `app/page.tsx`.

- [ ] **Step 1: Write `app/(app)/theses/page.tsx`** (empty state, disabled CTA)

```tsx
import { Button } from "@/components/ui/button";

export default function ThesesPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Your theses</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Positions you&apos;re tracking. The agent watches each one for new evidence.
          </p>
        </div>
        <Button disabled>New thesis</Button>
      </div>

      <div className="mt-16 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-20 text-center">
        <p className="font-medium text-zinc-900">No theses yet</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Thesis creation arrives in the next phase. Once it&apos;s here, you&apos;ll write a
          position and a few claims, and the agent takes it from there.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx` with the landing page** (split hero + how-it-works)

```tsx
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="size-[18px] rounded-[5px] bg-primary" />
          Thesis Tracker
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <SignedOut>
            <Link href="/sign-in" className="text-zinc-600 hover:text-zinc-900">Sign in</Link>
            <Button asChild size="sm"><Link href="/sign-up">Create your thesis</Link></Button>
          </SignedOut>
          <SignedIn>
            <Button asChild size="sm"><Link href="/theses">Go to dashboard</Link></Button>
          </SignedIn>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-primary">
            Agentic thesis tracking
          </span>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Know when your investment thesis stops being true.
          </h1>
          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-zinc-600">
            Write your thesis as claims. An AI agent watches the world — news, filings, earnings —
            and shows you, with citations, whether the evidence still backs you.
          </p>
          <div className="mt-7 flex gap-3">
            <Button asChild size="lg"><Link href="/sign-up">Create your thesis</Link></Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-md bg-[#eef2f7] px-2 py-0.5 font-mono text-xs font-medium text-primary">
              NVDA · LONG
            </span>
            <span className="font-mono text-xs text-health-strong">+0.62</span>
          </div>
          <p className="mt-3 text-sm font-semibold">Long NVDA — data-center thesis</p>
          <p className="mt-3 text-xs text-zinc-600">Data-center revenue grows &gt;40% YoY</p>
          <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-zinc-100">
            <span className="bg-health-strong" style={{ flex: 6 }} />
            <span className="bg-health-neutral" style={{ flex: 2 }} />
            <span className="bg-health-weak" style={{ flex: 1 }} />
          </div>
          <p className="mt-4 text-[11px] text-zinc-400">
            8 pieces of evidence · last agent run 2 days ago
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-zinc-100 px-6">
        <div className="grid divide-y divide-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { n: "01", t: "Write your thesis", d: "A position plus 2–5 claims that make it falsifiable." },
            { n: "02", t: "The agent researches", d: "It searches, reads filings, and gathers evidence on a schedule." },
            { n: "03", t: "Watch the health", d: "Each claim strengthens or weakens — every call is inspectable." },
          ].map((s) => (
            <div key={s.n} className="px-2 py-6 sm:px-6">
              <span className="font-mono text-xs text-primary">{s.n}</span>
              <p className="mt-2 font-semibold">{s.t}</p>
              <p className="mt-1 text-sm text-zinc-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. `npm run dev` → landing page renders the split hero; `/theses` (signed in) shows the empty state.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/theses/page.tsx" app/page.tsx
git commit -m "feat: add landing page and empty theses dashboard"
```

---

## Task 13: `.env.example`, README, and Vercel deploy

**Files:** Create `.env.example`, `README.md`.

- [ ] **Step 1: Write `.env.example`**

```env
# Neon Postgres (pooled connection string)
DATABASE_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=

# Clerk routing
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/theses
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/theses
```

- [ ] **Step 2: Write `README.md`** (current-state description, not a TODO list)

Write a README that describes what Thesis Tracker IS (the agentic thesis-tracking product), the live demo link (filled after deploy), the stack, the current deployed state ("Phase 1: foundation — auth, database, and the app shell are live; thesis creation and the agent loop are coming next"), local-dev setup steps, and an architecture one-liner. Avoid phase-by-phase TODO framing.

- [ ] **Step 3: Verify, then commit**

```bash
npm run typecheck && npm run lint && npm run build
git add .env.example README.md
git commit -m "docs: add .env.example and project README"
```

- [ ] **Step 4: Deploy to Vercel** (user-driven)
  - Import the GitHub repo into Vercel.
  - Set all env vars from `.env.example` with real values (build root has no `.env.local`).
  - Deploy. Confirm the public URL serves the landing page.

- [ ] **Step 5: Configure the production Clerk webhook**
  - In Clerk dashboard → Webhooks → add endpoint `https://<vercel-url>/api/clerk/webhook`, subscribe to `user.created`, `user.updated`, `user.deleted`.
  - Copy the signing secret into Vercel env as `CLERK_WEBHOOK_SIGNING_SECRET`; redeploy.
  - Test: sign up with a fresh email on the deployed URL → confirm a `users` row appears in Neon (via webhook).

- [ ] **Step 6: Update README with the live demo URL, then commit**

```bash
git add README.md
git commit -m "docs: add live demo URL to README"
```

---

## Acceptance criteria (verify all before declaring done)

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` clean.
- [ ] `npm test` passes (webhook dispatch tests green).
- [ ] `npm run dev` boots; `localhost:3000` shows the landing page.
- [ ] Signing up creates a `users` row (webhook in prod, lazy creation locally).
- [ ] Signed-out user visiting `/theses` is redirected to sign-in.
- [ ] Signed-in user at `/theses` sees the empty dashboard.
- [ ] Deployed to Vercel; all of the above works on the production URL.
- [ ] No secrets in the repo; `.env.example` lists all required vars.
- [ ] README reflects current deployed state.
- [ ] `docs/DESIGN.md` updated with finalized tokens + landing decision.

## Notes for the implementer

- **Approval workflow:** This project requires explicit user approval before every `git add`/`git commit`. Each task ends in a commit — pause, summarize the change, show diffs, and wait for approval before staging.
- **Run `npm run typecheck` before every commit** (CLAUDE.md hard rule).
- **No `any`.** Use `unknown` and narrow. The `as never` casts in tests are scoped to mock Clerk's discriminated `WebhookEvent` union and are acceptable in test code only.
