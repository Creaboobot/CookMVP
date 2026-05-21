# Cookooi Database Schema Baseline

## Purpose

This document describes the first durable data schema baseline for Cookooi. It turns the Task 28 account/community architecture and Task 29 Supabase strategy into a reviewable migration file without enabling account persistence, public recipes, likes, or rankings in the current app.

Migration file:

```text
supabase/migrations/20260521235850_initial_data_schema.sql
```

The current Cookooi prototype still runs from browser-local settings, saved recipes, feedback metadata, and session export/import. No production database, Supabase project, or account feature flag is required unless a later task explicitly enables it.

## Platform Assumption

The baseline targets Supabase Auth plus Supabase Postgres.

- Supabase Auth owns user identity through `auth.users`.
- `public.users` stores Cookooi account metadata keyed by the Supabase user id.
- Private tables include owner columns and Row Level Security policies tied to `auth.uid()`.
- Public recipe tables contain sanitized public recipe content only.
- Service-role operations are expected for controlled publication, imports, moderation, ranking jobs, and audit writes.

## Entities Covered

The migration creates these first-pass entities:

- `users`
- `user_profiles`
- `user_settings`
- `recipe_requests`
- `voice_note_transcriptions`
- `generated_recipes`
- `saved_recipes`
- `follow_up_requests`
- `feedback_events`
- `public_recipes`
- `public_recipe_versions`
- `recipe_publications`
- `recipe_likes`
- `recipe_bookmarks`
- `recipe_reports`
- `recipe_ranking_signals`
- `audit_events`

This covers the Task 30 minimum entities, including user settings, voice-note transcription metadata without raw audio storage, community likes/bookmarks/reports, ranking signals, and audit metadata.

## Private Ownership Model

Private account rows use `user_id` ownership fields referencing `public.users(id)`. Browser-facing policies use `auth.uid()` for same-user access. The migration also keeps `anonymous_session_id` fields on request, generated recipe, voice metadata, follow-up, and feedback tables so future migration jobs can import browser-local tester data through a trusted service-role path.

Anonymous rows are not browser-readable in this baseline. They are reserved for import or migration operations after a clear user action and consent.

## Public Recipe Boundary

Publishing is modeled as a copy-and-sanitize workflow:

1. A private `saved_recipes` row remains private.
2. A controlled service operation creates a `public_recipes` row.
3. It writes an immutable `public_recipe_versions` row with only public display fields.
4. It writes a `recipe_publications` bridge with `sanitization_version`.
5. It records operational context in `audit_events`.

`public_recipe_versions` intentionally does not include columns for raw prompts, raw ingredients text from the private request, voice transcripts, raw audio, private notes, follow-up questions, anonymous session ids, provider errors, or validation failures.

General public-facing recipe notes can live in fields such as `allergy_notes_json` and `food_safety_notes_json`, but those fields are recipe content notes, not copies of the user's personal allergy list or private constraints.

## Constraints And Indexes

Core database protections include:

- Foreign keys from private recipe data to `users`, `recipe_requests`, `generated_recipes`, and `saved_recipes`.
- Foreign keys from public recipe versions, publications, likes, bookmarks, reports, and ranking signals to public recipe rows.
- `schema_version` columns on evolving payload tables.
- Uniqueness for `users(auth_provider, auth_subject)`.
- Uniqueness for `user_profiles.handle`.
- Uniqueness for one public version number per public recipe.
- Uniqueness for one user like per public recipe.
- Uniqueness for one user bookmark per public recipe.
- Owner and created-time indexes for private tables.
- Public discovery, report queue, ranking, and audit lookup indexes.

## Row Level Security Baseline

The migration enables RLS on every created table.

Authenticated users can manage their own private rows. Public readers can select only `public_recipes` with `status = 'published'` and the public versions attached to published recipes. Owners can select their own unpublished public recipe rows for future preview flows.

The baseline deliberately does not add browser-role policies for service-owned operations such as creating public recipe rows, publication bridge rows, ranking signals, or audit events. Later implementation tasks should add narrow server routes or database functions for those operations instead of exposing direct browser writes.

## Feature Flags And Runtime Behavior

This task does not add any runtime database integration. The current app remains runnable without Supabase configuration.

Future tasks should keep account/database behavior disabled by default until reviewed:

```text
COOKOOI_ACCOUNTS_ENABLED=false
COOKOOI_SERVER_LIBRARY_ENABLED=false
COOKOOI_PUBLIC_RECIPES_ENABLED=false
COOKOOI_COMMUNITY_SIGNALS_ENABLED=false
```

Secrets remain server-side only and must not be committed:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `OPENAI_API_KEY`

Browser-safe Supabase configuration is not permission-safe by itself; it should only be exposed after RLS and auth flows are implemented and reviewed.

## Migration Validation Plan

Until a Supabase project or local Supabase CLI workflow is approved, repository validation is text-contract based:

- `test/database-schema-baseline.test.mjs` checks required tables, RLS, ownership, uniqueness, indexes, schema versions, and the public/private boundary.
- `npm.cmd test` must pass.
- Changed JavaScript test files must pass `node --check`.
- `git diff --check` must pass.
- `npx.cmd wrangler deploy --dry-run` must pass.
- Secret scans must not find OpenAI, Supabase, Clerk, or database URL values.

When a Supabase project or local Supabase CLI is available, future tasks should add a migration smoke test that applies this SQL to a disposable database and verifies RLS behavior with two test users.

## Follow-Up Work

Later tasks should add:

- Supabase CLI configuration or CI migration smoke tests after the project strategy is approved.
- Two-user RLS tests against a disposable Supabase database or branch.
- Server-only publication sanitizer code that writes `public_recipes`, `public_recipe_versions`, `recipe_publications`, and `audit_events` in one transaction.
- Account migration logic from browser-local exports after explicit user consent.
- Public recipe API tests proving private prompts, transcripts, notes, follow-up questions, and personal constraints never appear in public responses.
