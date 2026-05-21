# Cookooi Auth, Database, And Environment Strategy

## Purpose

This document records the recommended backend foundation for Cookooi accounts, private user-owned data, future public recipes, likes, rankings, and production environments. It is a planning and architecture decision only. It does not add account UI, live database writes, provider accounts, or user-facing social features.

Research date: May 21, 2026.

## Decision Summary

Primary recommendation: Supabase Auth plus Supabase Postgres.

Fallback path: Clerk plus managed Postgres, preferably Supabase Postgres using Clerk's native Supabase integration if Supabase Auth is rejected after human review.

Do not use Cloudflare D1 as the primary account/community database for the next stage. D1 remains useful for Worker-local operational data or a future all-Cloudflare prototype, but it does not provide the built-in consumer auth and row-level ownership model Cookooi needs for private recipes and later public community features.

## Why Supabase Auth Plus Postgres

Cookooi needs a backend that can safely support:

- account-owned private settings, recipe requests, generated recipes, saved recipes, voice transcription metadata, and follow-up requests;
- explicit publication from private saved recipes to sanitized public recipe versions;
- likes, bookmarks, reports, ranking signals, and people-also-liked recommendations;
- schema migrations with reviewable SQL;
- local, preview, and production separation;
- backups and rollback options;
- a path that future agents can validate without needing to reinterpret the data model.

Supabase Auth plus Postgres best matches those needs because auth identity, Postgres ownership columns, Row Level Security, migrations, branching, and backups live in one managed platform. It also keeps the current Cloudflare Worker deployment model intact: the Worker can keep OpenAI calls and privileged publication/sanitization flows server-side, while future browser auth can use only publishable Supabase configuration.

## Option Comparison

| Option | Fit | Strengths | Tradeoffs | Recommendation |
| --- | --- | --- | --- | --- |
| Supabase Auth plus Supabase Postgres | High | Built-in auth, Postgres, RLS, SQL migrations, project branching, backups/PITR options, service-role server operations | Requires careful RLS policy discipline and secret separation; branch usage may add cost | Primary path |
| Clerk plus managed Postgres | Medium | Strong hosted auth UX, production/development instances, good account management, can integrate with Supabase RLS through native third-party auth | Adds a second auth vendor; authorization claims and RLS policies are more complex; separate billing and webhooks | Fallback if Supabase Auth does not meet product needs |
| Cloudflare D1 plus custom or third-party auth | Low to medium | Fits the current Worker runtime, simple Wrangler migrations, local D1 development, Time Travel backups | No built-in consumer auth/RLS equivalent; app code must enforce ownership; D1 limits are tighter for account/community growth | Not primary; consider only for operational tables or an all-Cloudflare simplification |

## Primary Architecture

Use Supabase as the account and relational data system:

- Supabase Auth owns user identity.
- Supabase Postgres owns private and public recipe data.
- RLS is enabled on every exposed schema table before browser access is allowed.
- Private tables use `user_id` ownership columns tied to `auth.uid()`.
- Public recipe tables expose only sanitized public fields and aggregate community data.
- Worker/server routes use service-role access only for trusted operations that cannot safely run directly from the browser, such as publication sanitization, administrative moderation, imports, and future background jobs.
- Browser code may eventually use `SUPABASE_URL` and a publishable or anon key, but never service-role keys or direct database URLs.
- Current localStorage behavior remains the active MVP until a later task explicitly enables account persistence behind a feature flag.

## Fallback Architecture

If human review rejects Supabase Auth because Cookooi needs a richer hosted account UI, organizations, invitation workflows, or a different auth vendor, use Clerk for auth and keep Postgres as the database.

Preferred fallback:

- Clerk handles login, sessions, and account UI.
- Supabase Postgres remains the database.
- Use Clerk's current native Supabase integration rather than the deprecated JWT template approach.
- RLS policies read Clerk session token claims through Supabase's third-party auth provider integration.
- Store Clerk user ids as text owner identifiers, or map them into internal UUID users in a controlled `users` table.

Rejected fallback for now:

- Clerk plus a generic Postgres host with all authorization in Worker code. This is possible, but it removes database-level RLS as a safety net and makes every API route responsible for ownership checks.

## Cloudflare-Native Position

Keep Cloudflare Workers as the app and API runtime. Do not move the whole backend off Cloudflare.

Use Cloudflare for:

- static assets and Worker routes;
- server-side OpenAI calls;
- feature flags and environment-specific configuration;
- secrets storage for Worker-only keys;
- optional future lightweight operational state if a later task justifies D1.

Avoid using D1 as the main Cookooi account/community database until a later task proves that custom auth, ownership checks, migration handling, and data growth limits are acceptable. D1's fit is strongest when the data is Worker-owned and app-enforced, not when users need strong private row ownership and future community moderation.

## Data Ownership Rules

The Task 28 architecture remains the source of truth for entities and privacy boundaries. The platform strategy adds these implementation rules:

- Every private row must have an account owner or anonymous-session migration owner.
- Browser-readable private tables require RLS policies before any client code can access them.
- Service-role operations must be narrow, server-only, and covered by tests.
- Public recipe rows are sanitized copies, not visibility toggles on private saved recipes.
- Publishing writes `public_recipes`, `public_recipe_versions`, `recipe_publications`, and `audit_events` in one controlled operation.
- Likes and bookmarks enforce one active user interaction per public recipe at the database level.
- Reports and moderation actions write audit events.
- Public ranking signals cannot include raw prompt text, voice transcripts, private notes, follow-up questions, allergies, avoidances, household details, or anonymous session ids.

## Environment Plan

### Local

Current behavior:

- No account or production database is required to run Cookooi locally.
- Browser-local settings, saved recipes, feedback metadata, and session export/import remain the default.
- `.dev.vars` stays ignored by Git and remains the local place for server-only OpenAI and future Supabase secrets.

Future data-layer work:

- Use Supabase CLI local development or a disposable Supabase branch for schema/migration validation.
- Keep account persistence disabled by default with `COOKOOI_ACCOUNTS_ENABLED=false` until an account UI task enables it.
- Use local-only credentials:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_TRANSCRIPTION_MODEL`
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DB_URL`

### Preview

Preview should be isolated from production:

- Use a Supabase preview branch or separate preview project.
- Use separate API credentials from production.
- Use a Cloudflare preview/staging Worker environment or preview deployment with its own secrets.
- Keep `COOKOOI_ACCOUNTS_ENABLED=false` until the relevant account task has a reviewed migration, RLS policy set, and feature-flag rollout plan.
- If preview branches are used, account for branch compute and storage cost in the human approval checklist.

Preview validation must prove:

- migrations apply cleanly to an empty preview database;
- RLS policies protect private rows across at least two users;
- public recipe queries cannot read private request, transcript, follow-up, or note fields;
- no production credentials are present in preview configuration.

### Production

Production must use a dedicated Supabase production project and Cloudflare production Worker secrets.

Production requirements:

- RLS enabled on all browser-exposed tables.
- Service-role key available only to the Worker and CI jobs that need privileged operations.
- Supabase database backups enabled according to plan tier, with PITR considered before account/community launch.
- Schema migrations are reviewed through PRs before they are applied.
- Destructive migrations require a backup/restore plan and a manual human approval note.
- Account/community features remain behind explicit feature flags until user-facing acceptance is complete.

## Required Configuration

### Server-Only Secrets

These must never be committed and must never be sent to the browser:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_ACCESS_TOKEN` for CI or migration automation
- `SUPABASE_PROJECT_ID` when used with CI automation
- `CLERK_SECRET_KEY` if the fallback path is selected
- any database pooler password or direct Postgres connection string

### Browser-Safe Configuration

These may be exposed to browser code only after RLS and auth flows are implemented and reviewed:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- `CLERK_PUBLISHABLE_KEY` if the fallback path is selected

Browser-safe does not mean permission-safe. Supabase browser access is safe only when RLS policies are correct and reviewed.

### Feature Flags

Use explicit flags so the current prototype is not accidentally converted into an unfinished account product:

- `COOKOOI_ACCOUNTS_ENABLED=false` by default.
- `COOKOOI_SERVER_LIBRARY_ENABLED=false` by default.
- `COOKOOI_PUBLIC_RECIPES_ENABLED=false` by default.
- `COOKOOI_COMMUNITY_SIGNALS_ENABLED=false` by default.

The next schema task may add placeholders or documented flag names, but it should not require a live production database for the current app to run.

## Migration And Rollback Expectations

Future migration tasks should:

- store SQL migration files in the repo;
- include `enable row level security` and policies for private tables before browser access is introduced;
- include uniqueness constraints for one-like and one-bookmark per user/public recipe;
- include indexes for owner lookup, public discovery, reports, and ranking jobs;
- avoid committing environment-specific database URLs;
- support local reset or preview branch validation;
- include rollback notes even when rollback is a forward corrective migration.

Rollback rules:

- Prefer forward-only corrective migrations for schema changes after production launch.
- Before destructive changes, take a restorable backup or confirm PITR coverage.
- Do not drop private user data columns or tables in the same PR that introduces a replacement unless migration/backfill has already run and been verified.
- For public recipe publication bugs, disable the public feature flag first, then repair data or roll forward.

## Future Agent Validation Checklist

When implementing Tasks 30 and later data-layer work, execution and review agents should validate:

- `npm.cmd test` passes.
- Changed JavaScript files pass `node --check`.
- SQL/schema tests or migration smoke tests cover the new schema.
- `git diff --check` passes.
- `npx.cmd wrangler deploy --dry-run` passes.
- No committed secrets match OpenAI, Supabase, Clerk, or database URL patterns.
- RLS is enabled on all private and public-write tables exposed through Supabase APIs.
- Policies include same-user read/write tests and cross-user denial tests.
- Public recipe rows do not include raw ingredients text, raw prompts, voice transcripts, follow-up questions, private notes, allergies, avoidances, household details, provider errors, or anonymous session ids.
- The app still starts without account persistence unless the task explicitly enables a feature flag.

## Concrete Human Decisions Before Live Account Work

These do not block this documentation task, but they should become support tasks before live account/community rollout:

- Approve Supabase as the account/database vendor and select a plan tier.
- Confirm whether preview branches are acceptable from a cost perspective.
- Decide whether to enable PITR before storing real tester account data.
- Decide the initial auth methods: email magic link, password, OAuth providers, or a reduced first-testing subset.
- Confirm public profile handle policy before public recipes launch.
- Confirm moderation ownership and report-response SLA before community discovery launches.
- Confirm whether Clerk should replace Supabase Auth if account UX requirements exceed Supabase Auth's built-in flow.

## Official Source Notes

The decision above is based on the current official documentation for:

- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase branching: https://supabase.com/docs/guides/deployment/branching
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Clerk and Supabase integration: https://clerk.com/docs/guides/development/integrations/databases/supabase
- Clerk environments: https://clerk.com/docs/deployments/environments
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Cloudflare Workers environments: https://developers.cloudflare.com/workers/wrangler/environments/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/

If these provider docs materially change, update this ADR before implementing provider-specific schema or auth code.
