# Holyship Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform holyship from a standalone flow engine into a SaaS platform by integrating platform-core for auth/billing/fleet/gateway, simplifying to GitHub-only, and wiring ephemeral holyshipper containers.

**Architecture:** Holyship becomes holyship-platform — a Hono server that combines the existing Engine class with platform-core's auth, billing, fleet, and metered gateway. Hand-rolled tenant isolation, dispatchers, worker pool, and generic integration adapters are ripped out. GitHub App is the sole integration. Holyshipper containers are provisioned per-issue via fleet.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Postgres, platform-core (BetterAuth, Stripe, FleetManager, metered gateway), GitHub App API.

**Spec:** `docs/superpowers/specs/2026-03-14-holyship-platform-design.md`

---

## Chunk 1: Rip Out Dead Code

The first step is surgery — remove everything the spec says to rip out. This makes the codebase smaller and prevents confusion about what's current vs legacy.

### Task 1: Delete dispatcher system

**Files:**
- Delete: `src/dispatcher/` (entire directory — 10 files)

- [ ] **Step 1: Delete the dispatcher directory**

```bash
rm -rf src/dispatcher/
```

- [ ] **Step 2: Find and remove all imports of dispatcher modules**

Run: `grep -r "dispatcher" src/ --include="*.ts" -l` — fix each file that imports from `src/dispatcher/`.

Remove the imports and any code paths that reference dispatchers. The Engine class does NOT depend on dispatchers — they were only used by the run-loop.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "rip: remove dispatcher system (NukeDispatcher, SdkDispatcher, ClaudeCodeDispatcher)"
```

### Task 2: Delete run-loop, worker pool, claim handler

**Files:**
- Delete: `src/run-loop/` (entire directory)
- Delete: `src/pool/` (entire directory)
- Delete: `src/claim/` (entire directory)
- Delete: `src/worker/` (entire directory)
- Delete: `src/ws/` (entire directory)

- [ ] **Step 1: Delete the directories**

```bash
rm -rf src/run-loop/ src/pool/ src/claim/ src/worker/ src/ws/
```

- [ ] **Step 2: Find and remove all imports**

Run: `grep -rE "(run-loop|pool|claim|worker|/ws)" src/ --include="*.ts" -l` — fix each file.

Key files likely affected:
- `src/api/hono-server.ts` — references `Pool`, `ClaimHandler`, `InMemoryWorkerRepo`, `IWorkerRepo`
- `src/execution/cli.ts` — wires up run-loop and pool
- `src/main.ts` — if it references any of these

Remove the imports, constructor params, and usage. The Hono server's worker-facing routes (`/api/claim`, `/api/entities/:id/report`) stay — they just no longer depend on ClaimHandler internals.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "rip: remove run-loop, worker pool, claim handler, worker repo, websocket"
```

### Task 3: Delete integrations adapter layer

**Files:**
- Delete: `src/integrations/` (entire directory)
- Delete: `src/sources/` (entire directory)

- [ ] **Step 1: Delete the directories**

```bash
rm -rf src/integrations/ src/sources/
```

- [ ] **Step 2: Find and remove all imports**

Run: `grep -rE "(integrations|sources)" src/ --include="*.ts" -l` — fix each file.

Key files likely affected:
- `src/engine/engine.ts` — `EngineDeps.integrationRepo`, `EngineDeps.adapterRegistry`, `AdapterRegistry` import. Remove these optional deps. The engine will still work — `adapterRegistry` was optional and defaults to null.
- `src/engine/gate-evaluator.ts` — may reference adapter registry for primitive ops. Primitive ops that used adapters (`vcs.*`, `issue_tracker.*`) will need to be rewritten as direct GitHub API calls in a later task. For now, remove the adapter dependency and leave primitive ops as stubs that throw "not implemented."
- `src/engine/on-enter.ts` and `src/engine/on-exit.ts` — may reference adapter registry. Same treatment.
- `src/api/hono-server.ts` — integration admin routes, `IIntegrationRepository` references.
- `src/execution/mcp-server.ts` — integration tools.
- `src/repositories/drizzle/schema.ts` — integration tables. Keep the table definitions for now (will be replaced by `github_installations` in a later task).

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "rip: remove integrations adapter layer and sources/watches system"
```

### Task 4: Delete radar-db

**Files:**
- Delete: `src/radar-db/` (entire directory)

- [ ] **Step 1: Delete the directory**

```bash
rm -rf src/radar-db/
```

- [ ] **Step 2: Remove imports and references**

Run: `grep -r "radar-db" src/ --include="*.ts" -l` — fix each file.

Key files: `src/api/hono-server.ts` uses `IEntityActivityRepo`, `EventLogRepo`, `IWorkerRepo`, `SourceRepo`, `WatchRepo`. Remove these deps from `HonoServerDeps` interface and all routes that use them (`/api/entities/:id/activity`, `/api/pool/slots`, `/api/workers`, `/api/sources`, `/api/events`).

- [ ] **Step 3: Remove radar-db tables from Drizzle schema**

In `src/repositories/drizzle/schema.ts`, remove tables: `sources`, `watches`, `eventLog`, `workers`, `entityActivity`, `throughputEvents`, `entityMap`, `rateLimitBuckets`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "rip: remove radar-db tables and repos"
```

### Task 5: Clean up hono-server tenant isolation

**Files:**
- Modify: `src/api/hono-server.ts`

- [ ] **Step 1: Remove tenant cache and multi-tenant engine creation**

In `hono-server.ts`, remove:
- `tenantCache` Map and all related functions (`evictOldestTenant`, `getTenantEntry`)
- `resolveTenantId` function
- `getEngine` / `getMcpDeps` functions that use tenant cache
- `x-tenant-id` header handling
- Rate limiting implementation (DB token bucket — `createRateLimiter`, `rateLimitBuckets` import)

Replace with a single engine instance passed in via `HonoServerDeps`. All routes use `deps.engine` directly.

- [ ] **Step 2: Remove hand-rolled auth middleware**

Remove `requireWorkerAuth`, `requireAdminAuth`, `requireAuth` functions that check `HOLYSHIP_ADMIN_TOKEN`/`HOLYSHIP_WORKER_TOKEN`. These will be replaced by platform-core auth in a later task. For now, leave routes unprotected (or add a simple placeholder).

- [ ] **Step 3: Remove built-in UI**

Remove `/ui` route and `UI_HTML` import. The UI will be a separate app (holyship-ui).

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "rip: remove tenant cache, hand-rolled auth, rate limiting, built-in UI"
```

### Task 6: Delete remaining dead code

**Files:**
- Delete: `src/ui/` (entire directory — built-in HTML dashboard)
- Delete: `src/cors.ts` (hand-rolled CORS)
- Delete: `src/auth.ts` (hand-rolled bearer token auth)
- Modify: `src/execution/cli.ts` — strip commands that depend on deleted modules

- [ ] **Step 1: Delete dead files/directories**

```bash
rm -rf src/ui/ src/cors.ts src/auth.ts
```

- [ ] **Step 2: Fix imports in remaining files**

Run: `grep -rE "(ui/|cors|auth\.ts)" src/ --include="*.ts" -l` — fix each.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Run tests**

Run: `npx vitest run` — expect many test failures from deleted modules. Delete test files for deleted modules:

```bash
rm -rf tests/silo-client/ tests/e2e/ tests/cors*.test.ts tests/ui/
```

Fix remaining test failures.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "rip: remove UI, CORS, auth helpers, dead test files"
```

### Task 7: Regenerate migrations

- [ ] **Step 1: Delete old migrations and regenerate**

```bash
rm -rf drizzle/
npx drizzle-kit generate
```

- [ ] **Step 2: Verify no references to deleted tables**

Run: `grep -ri "sources\|watches\|eventLog\|rateLimitBuckets\|entityActivity\|throughputEvents\|entityMap" drizzle/` — should return nothing.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: regenerate migrations after rip-out"
```

---

## Chunk 2: Wire Platform-Core

Add platform-core as a dependency and wire up auth, billing, and gateway following the paperclip-platform pattern.

### Task 8: Add platform-core dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install platform-core**

```bash
pnpm add @wopr-network/platform-core
```

- [ ] **Step 2: Install peer deps platform-core needs**

```bash
pnpm add pg @sentry/node stripe better-auth
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml && git commit -m "deps: add platform-core and peer dependencies"
```

### Task 9: Create boot sequence

**Files:**
- Create: `src/platform/boot.ts` — main boot sequence (replaces current `main.ts` exports)
- Create: `src/platform/config.ts` — Zod-validated env config
- Create: `src/platform/log.ts` — pino logger
- Create: `src/platform/db.ts` — shared Postgres pool + Drizzle DB

Reference: `~/paperclip-platform/src/index.ts` for the exact pattern.

- [ ] **Step 1: Create config.ts**

Zod schema with:
- `PORT`, `HOST`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `OPENROUTER_API_KEY`
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- `FLEET_DATA_DIR`

- [ ] **Step 2: Create db.ts**

Pool + Drizzle factory. Runs both platform-core migrations and holyship migrations on startup.

- [ ] **Step 3: Create log.ts**

Pino logger instance.

- [ ] **Step 4: Create boot.ts**

Boot sequence following paperclip-platform pattern:
1. DB + migrations
2. BetterAuth init (sessions, signup, login, onUserCreated → grantSignupCredits)
3. Credit ledger init
4. Gateway mount (metered inference proxy)
5. Engine init (the existing Engine class with repos)
6. Hono app with platform-core middleware
7. `serve()`

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: platform-core boot sequence (auth, billing, gateway, engine)"
```

### Task 10: Wire auth middleware

**Files:**
- Modify: `src/api/hono-server.ts`

- [ ] **Step 1: Replace hand-rolled auth with platform-core auth**

Import from platform-core:
- `resolveSessionUser()` for session-based auth (UI requests)
- `scopedBearerAuth()` for API token auth (holyshipper claim/report)
- `serviceKeyAuth()` for gateway service key auth

Worker endpoints (`/api/claim`, `/api/entities/:id/report`, `/api/entities/:id/fail`) use `scopedBearerAuth()`.
Admin endpoints use `resolveSessionUser()` + role check.
Gateway is handled by platform-core's `mountGateway()`.

- [ ] **Step 2: Write test for auth middleware**

Test that unauthenticated requests to `/api/claim` return 401.
Test that valid bearer token passes through.

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: platform-core auth middleware on all endpoints"
```

---

## Chunk 3: GitHub App Integration

### Task 11: GitHub installations table

**Files:**
- Modify: `src/repositories/drizzle/schema.ts` — add `github_installations` table
- Create: `src/github/installation-repo.ts` — CRUD for installations
- Create: `src/github/token-generator.ts` — generate installation access tokens

- [ ] **Step 1: Add github_installations table to schema**

```typescript
export const githubInstallations = pgTable("github_installations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  accountLogin: text("account_login").notNull(), // GitHub org/user name
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
```

- [ ] **Step 2: Remove old integrations table from schema**

Delete the `integrations` table definition that was part of the adapter layer.

- [ ] **Step 3: Write installation repo**

Simple Drizzle CRUD: `create`, `getByTenantId`, `delete`.

- [ ] **Step 4: Write token generator**

```typescript
export async function generateInstallationToken(
  installationId: number,
  appId: string,
  privateKey: string,
): Promise<{ token: string; expiresAt: Date }>
```

Uses GitHub App JWT + REST API to generate a 1-hour installation access token. Reference: `POST /app/installations/{installation_id}/access_tokens`.

- [ ] **Step 5: Write tests**

Test token generator with mocked GitHub API response.
Test installation repo CRUD.

- [ ] **Step 6: Regenerate migrations**

```bash
rm -rf drizzle/ && npx drizzle-kit generate
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: GitHub App installation table and token generator"
```

### Task 12: GitHub webhook receiver

**Files:**
- Create: `src/github/webhook.ts` — GitHub App webhook handler

- [ ] **Step 1: Write webhook handler**

Handles GitHub App webhook events:
- `installation` event → store/remove `installation_id`
- `issues.opened` / `issues.labeled` → create entity in flow (ingestion)

Verifies webhook signature using `GITHUB_WEBHOOK_SECRET`.

- [ ] **Step 2: Mount webhook route**

Add `POST /api/webhooks/github` to the Hono app. No auth middleware — uses webhook signature verification instead.

- [ ] **Step 3: Write tests**

Test webhook signature verification.
Test that `issues.opened` creates an entity.
Test that `installation.created` stores the installation ID.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: GitHub App webhook receiver (issues + installation events)"
```

---

## Chunk 4: Fleet Integration

### Task 13: Holyshipper provisioning

**Files:**
- Create: `src/fleet/provision-holyshipper.ts` — provision ephemeral holyshipper containers

- [ ] **Step 1: Write provisioning function**

```typescript
export async function provisionHolyshipper(opts: {
  entityId: string;
  tenantId: string;
  installationId: number;
  discipline: string;
  repoFullName: string;
  fleet: FleetManager;
  config: HolyshipConfig;
}): Promise<{ containerId: string; serviceKey: string }>
```

Steps:
1. Generate gateway service key for this tenant
2. Generate GitHub App installation token (1-hour)
3. `fleet.create()` with holyshipper image + env vars
4. `fleet.start()`
5. Return container ID + service key for later cleanup

- [ ] **Step 2: Write teardown function**

```typescript
export async function teardownHolyshipper(opts: {
  containerId: string;
  serviceKey: string;
  fleet: FleetManager;
  serviceKeyRepo: DrizzleServiceKeyRepository;
}): Promise<void>
```

Steps:
1. `fleet.remove(containerId)`
2. Revoke service key

- [ ] **Step 3: Wire into engine event handler**

When engine emits `entity.created` → provision a holyshipper.
When engine transitions to a terminal state → teardown the holyshipper.

- [ ] **Step 4: Write tests**

Test provisioning with mocked FleetManager.
Test teardown revokes service key.
Test terminal state triggers teardown.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ephemeral holyshipper provisioning via platform-core fleet"
```

### Task 14: "Ship It" endpoint

**Files:**
- Create: `src/api/ship-it.ts` — manual issue shipping endpoint

- [ ] **Step 1: Write Ship It handler**

`POST /api/ship-it` with body `{ issueUrl: string }` or `{ owner: string, repo: string, issueNumber: number }`.

Steps:
1. Resolve tenant from session
2. Fetch issue details via GitHub API (using installation token)
3. Create entity in flow with issue data as payload
4. Provision holyshipper
5. Return entity ID

- [ ] **Step 2: Mount route**

Add to Hono app with session auth middleware.

- [ ] **Step 3: Write tests**

Test with mocked GitHub API and fleet.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Ship It endpoint for manual issue submission"
```

---

## Chunk 5: Spending Caps + Primitive Ops

### Task 15: Spending caps

**Files:**
- Modify: `src/engine/engine.ts` — add spending cap checks
- Modify: `src/repositories/interfaces.ts` — add `maxCreditsPerEntity` and `maxInvocationsPerEntity` to Flow

- [ ] **Step 1: Add spending cap fields to Flow interface**

Add `maxCreditsPerEntity: number | null` and `maxInvocationsPerEntity: number | null` to the `Flow` interface and `CreateFlowInput`.

- [ ] **Step 2: Add spending cap check in Engine.claimWork()**

Before creating an invocation, check:
- `maxInvocationsPerEntity` — count existing invocations for this entity, reject if over limit
- `maxCreditsPerEntity` — query tenant credit balance from ledger, reject if insufficient

If cap hit, transition entity to `budget_exceeded` terminal state.

- [ ] **Step 3: Add fields to Drizzle schema**

Add `max_credits_per_entity` and `max_invocations_per_entity` columns to `flow_definitions` table.

- [ ] **Step 4: Regenerate migrations**

- [ ] **Step 5: Write tests**

Test that entity transitions to `budget_exceeded` when invocation limit hit.
Test that entity transitions to `budget_exceeded` when credit balance insufficient.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: spending caps (max credits + max invocations per entity)"
```

### Task 16: Rewrite primitive ops as direct GitHub API calls

**Files:**
- Create: `src/github/primitive-ops.ts` — GitHub-specific gate operations
- Modify: `src/engine/gate-evaluator.ts` — wire primitive ops to GitHub

- [ ] **Step 1: Implement GitHub primitive ops**

Replace adapter-abstracted ops with direct GitHub API calls using installation tokens:
- `vcs.ci_status` → `GET /repos/{owner}/{repo}/commits/{ref}/check-runs`
- `vcs.pr_status` → `GET /repos/{owner}/{repo}/pulls/{number}`
- `vcs.pr_merge_queue_status` → `GET /repos/{owner}/{repo}/pulls/{number}` (check `merge_state_status`)
- `issue_tracker.comment_exists` → `GET /repos/{owner}/{repo}/issues/{number}/comments`
- `issue_tracker.post_comment` → `POST /repos/{owner}/{repo}/issues/{number}/comments`

All ops take entity artifacts (which contain repo owner, repo name, PR number, etc.) and an installation token.

- [ ] **Step 2: Wire into gate evaluator**

When gate type is `"primitive"`, route to `src/github/primitive-ops.ts` instead of the old adapter registry.

- [ ] **Step 3: Write tests**

Test each primitive op with mocked GitHub API responses.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: GitHub-native primitive ops for gates (ci_status, pr_status, etc.)"
```

---

## Chunk 6: tRPC + API Surface

### Task 17: tRPC routers for holyship

**Files:**
- Create: `src/trpc/index.ts` — root appRouter
- Create: `src/trpc/routers/flow.ts` — flow CRUD
- Create: `src/trpc/routers/entity.ts` — entity queries + Ship It
- Create: `src/trpc/routers/github.ts` — GitHub installation management

- [ ] **Step 1: Create tRPC root router**

Compose platform-core routers (billing, profile, settings) + holyship-specific routers (flow, entity, github).

- [ ] **Step 2: Create flow router**

Procedures:
- `flow.list` — list all flows for tenant
- `flow.get` — get flow by name
- `flow.update` — update flow definition (admin)

- [ ] **Step 3: Create entity router**

Procedures:
- `entity.list` — list entities with filters (state, flow)
- `entity.get` — get entity details + invocations + gate results
- `entity.shipIt` — create entity from issue URL (calls Ship It logic)

- [ ] **Step 4: Create github router**

Procedures:
- `github.installations` — list GitHub App installations for tenant
- `github.repos` — list repos accessible via installation
- `github.removeInstallation` — unlink an installation

- [ ] **Step 5: Mount tRPC adapter on Hono app**

- [ ] **Step 6: Write tests**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: tRPC routers (flow, entity, github)"
```

---

## Chunk 7: Holyship UI

### Task 18: Create holyship-ui repo

**Files:**
- Create new repo: `~/holyship-ui-new/` (thin shell on platform-ui-core)

- [ ] **Step 1: Scaffold from paperclip-platform-ui**

Copy the skeleton from `~/paperclip-platform-ui/`:
- `package.json` (rename, update deps)
- `next.config.ts`
- `tsconfig.json` (path aliases to platform-ui-core)
- `Dockerfile`
- `.env.example`

- [ ] **Step 2: Set up brand config**

Create `src/app/layout.tsx` with `setBrandConfig()`:

```typescript
setBrandConfig({
  productName: "Holy Ship",
  brandName: "Holy Ship",
  domain: "holyship.dev",
  tagline: "It's what you'll say when you see the results.",
  storagePrefix: "holyship",
  homePath: "/dashboard",
  navItems: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Ship It", href: "/ship" },
    { label: "Billing", href: "/billing/plans" },
    { label: "Settings", href: "/settings/profile" },
  ],
});
```

- [ ] **Step 3: Create Holy Ship-specific pages**

- `src/app/dashboard/page.tsx` — issues in flight, shipped, stuck, credits burned
- `src/app/ship/page.tsx` — "Ship It" form (issue URL input + button)
- `src/app/connect/page.tsx` — GitHub App install flow
- `src/app/activity/page.tsx` — live SSE activity feed

- [ ] **Step 4: Set up .env**

```
NEXT_PUBLIC_BRAND_PRODUCT_NAME="Holy Ship"
NEXT_PUBLIC_BRAND_DOMAIN="holyship.dev"
NEXT_PUBLIC_BRAND_TAGLINE="It's what you'll say when you see the results."
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 5: Verify dev server starts**

Run: `pnpm dev`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: holyship-ui thin shell on platform-ui-core"
```

---

## Chunk 8: Landing Page + Final Wiring

### Task 19: Landing page

- [ ] **Step 1: Create landing page at holyship.dev**

Hero section:
- "Holy Ship." (big)
- "It's what you'll say when you see the results." (subtitle)
- [Ship It] button → signup flow
- "Describe an issue. Get a merged PR. Guaranteed."

- [ ] **Step 2: Wire holyship.wtf redirect**

DNS redirect to holyship.dev.

- [ ] **Step 3: Commit**

### Task 20: Update main entry point

**Files:**
- Modify: `src/main.ts` — point to new boot sequence
- Modify: `package.json` — update bin, exports

- [ ] **Step 1: Replace main.ts**

Replace current `main.ts` (which just exports DB bootstrap) with the new platform boot sequence from `src/platform/boot.ts`.

- [ ] **Step 2: Update package.json exports**

The package now exports both the engine (for testing/embedding) and the platform server.

- [ ] **Step 3: Full integration test**

Start the server, verify:
- Auth endpoints respond (BetterAuth)
- Gateway responds at `/v1`
- Engine claim/report endpoints work with bearer token
- GitHub webhook endpoint accepts signed payloads

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: holyship-platform main entry point"
```

---

## Summary

| Chunk | Tasks | What it does |
|-------|-------|-------------|
| 1: Rip Out | 1-7 | Delete dispatchers, run-loop, pool, integrations, sources, radar-db, tenant cache, auth, UI |
| 2: Wire Platform-Core | 8-10 | Add platform-core, boot sequence, auth middleware |
| 3: GitHub App | 11-12 | Installations table, token generator, webhook receiver |
| 4: Fleet | 13-14 | Holyshipper provisioning/teardown, "Ship It" endpoint |
| 5: Spending Caps | 15-16 | Per-entity limits, GitHub-native primitive ops |
| 6: tRPC | 17 | Flow, entity, github routers for UI |
| 7: UI | 18 | Thin shell on platform-ui-core |
| 8: Landing | 19-20 | holyship.dev, main entry point, integration test |

Chunks 1-2 can be done in one session. Chunks 3-5 are the core new functionality. Chunks 6-8 are the UI and polish.
