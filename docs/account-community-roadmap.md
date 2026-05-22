# Cookooi Account And Community Roadmap

## Purpose

This roadmap turns the Cookooi account, data, privacy, and operations foundations from Tasks 28-34 into a phased execution plan. It does not add account UI, live database writes, public recipe screens, likes, rankings, recommendations, or new tester-facing behavior.

The default rule remains stability first: the current anonymous tester build keeps browser-local settings, saved recipes, feedback metadata, and session export/import until a later reviewed task explicitly enables account features behind feature flags.

## Source Documents

Later tasks should read these documents before implementation:

- `docs/account-community-architecture.md` for the private/public recipe model, entities, publication rules, likes, rankings, and people-also-liked recommendations.
- `docs/auth-database-environment-strategy.md` for the Supabase Auth plus Postgres primary path, fallback path, environment plan, secrets, and human decisions.
- `docs/database-schema-baseline.md` and `supabase/migrations/20260521235850_initial_data_schema.sql` for the initial schema, RLS baseline, public recipe tables, interaction tables, and audit tables.
- `docs/data-access-layer.md` for default-off feature flags and the server/browser service boundary.
- `docs/auth-session-authorization.md` for server-verified identity and private/public authorization rules.
- `docs/privacy-consent-retention.md` and `src/privacy-governance.mjs` for consent, retention, publication sanitization, analytics, export/delete, and moderation rules.
- `docs/user-testing-operations.md` for runtime health checks, OpenAI-backed public testing, fallback boundaries, privacy-safe support notes, rate limits, and support runbooks.

## Roadmap Principles

- Preserve the current tester workflow until account beta acceptance is met.
- Enable account, public recipe, and community behavior only through reviewed feature flags.
- Treat browser-local data import as explicit consent, not as an automatic side effect of sign up.
- Keep private saved recipes and public recipes as separate records; publishing creates a sanitized copy.
- Keep likes, bookmarks, reports, ranking signals, and people-also-liked recommendations as first-class roadmap phases, not optional extras.
- Use server-verified identity for private ownership and service-role routes for trusted publication, moderation, imports, and ranking jobs.
- Prove RLS, privacy sanitization, and public/private API boundaries before broad account or community testing.

## Phase 0: Anonymous Tester Stability

Goal: keep the existing Cookooi tester build stable while account/community foundations are prepared.

Scope:

- Keep settings, saved recipes, feedback metadata, and session export/import browser-local.
- Keep `COOKOOI_ACCOUNTS_ENABLED=false`, `COOKOOI_SERVER_LIBRARY_ENABLED=false`, `COOKOOI_PUBLIC_RECIPES_ENABLED=false`, and `COOKOOI_COMMUNITY_SIGNALS_ENABLED=false`.
- Maintain `GET /api/health`, `npm run health:local`, fallback testing, OpenAI-backed public route checks, and README tester flow.
- Continue using metadata-only feedback and privacy-safe support notes.

Exit criteria:

- `npm.cmd test`, changed-file syntax checks when relevant, `git diff --check`, and Wrangler dry-run continue to pass.
- Public tester invites use an OpenAI-backed route check rather than fallback-only health.
- No account/community UI or API surface appears to testers.

## Phase 1: Human Setup And Approval Gate

Goal: complete human decisions before implementation tasks depend on provider accounts, legal copy, public discovery policy, or moderation policy.

Required human decisions:

- Approve Supabase Auth plus Supabase Postgres as the account/database provider, or explicitly choose the Clerk plus managed Postgres fallback.
- Create or approve local, preview, and production provider projects, including branch or preview cost expectations.
- Decide whether PITR or equivalent backup coverage is required before account beta.
- Approve auth methods for beta, such as email link, OAuth providers, or email/password.
- Approve final privacy notice, publication consent, export/delete, and account deletion copy.
- Decide whether public recipes are searchable by default after publishing or initially available only by direct link.
- Decide public profile and handle policy before public recipes identify creators.
- Define moderation ownership, report categories, and response expectations.
- Approve initial ranking weights for likes, bookmarks, freshness, reports, and curation.
- Decide whether people-also-liked recommendations launch in the first public discovery MVP or behind a later flag.

Exit criteria:

- Provider projects and secrets are available outside the repo for local/preview validation.
- The chosen auth/database path is recorded in a support note or follow-up task.
- The privacy/moderation/searchability decisions needed for account beta and publication beta are no longer ambiguous.

## Phase 2: Account Beta Foundation

Goal: add sign-in and server-verified identity without changing anonymous tester behavior by default.

Implementation sequence:

1. Add Supabase client configuration with browser-safe variables only.
2. Add server-side session verification that passes a verified identity into `createRequestContext`.
3. Add minimal account UI for sign in, sign out, and account status.
4. Add profile bootstrap for `users` and `user_profiles` after successful auth.
5. Keep anonymous routes and browser-local storage working when account flags are off.
6. Add local and preview RLS validation with at least two users before enabling browser database reads.

Account beta readiness acceptance criteria:

- Anonymous testing still works with all account flags off.
- Account UI is hidden or inactive unless the reviewed account flag is enabled.
- Server routes never trust client-supplied user ids for ownership.
- RLS policies deny cross-user private reads and writes in automated validation.
- No service-role key, direct database URL, OpenAI key, or provider secret is sent to the browser.
- Account creation writes only the minimum profile/account rows needed for beta.
- Export/delete copy is present or the beta explicitly blocks those actions with clear scope.

## Phase 3: Browser-Local To Account Migration

Goal: let a signed-in user import existing browser-local Cookooi data into private account records after clear consent.

Migration flow:

1. User signs in.
2. Cookooi detects browser-local saved recipes, settings, and feedback metadata.
3. Cookooi shows an import preview with counts, data types, and privacy notes.
4. User chooses what to import: saved recipes, settings, feedback metadata, or none.
5. Server-side import validates the payload schema, writes private account rows, and records `audit_events`.
6. Cookooi keeps the browser-local recovery path until the user clears it.
7. The import result summarizes imported, skipped, and duplicate records without exposing raw sensitive text in logs.

Conflict behavior:

- Settings: default to "review before replace"; do not silently overwrite account settings. Offer keep-account, replace-with-browser-local, or merge selected fields.
- Saved recipes: deduplicate by stable recipe id when present, otherwise normalized title plus summary. Keep both only when the normalized content differs materially.
- Feedback metadata: import only metadata-safe records. Do not import raw ingredients, craving text, avoidances, allergy text, voice transcripts, raw follow-up questions, or full tester notes unless a later consent model explicitly allows private note import.
- Anonymous session id: store only as internal migration metadata and never copy it to public recipe, ranking, or public export payloads.
- Failed import: leave browser-local data unchanged and write an audit/support-safe failure category.

Migration acceptance criteria:

- Import requires an affirmative action after sign in.
- Imported saved recipes and settings are private account data.
- Cross-user import attempts fail through server authorization and RLS.
- Duplicate handling is deterministic and covered by tests.
- Migration logs and support notes use counts, ids, statuses, and error categories, not raw request text.

## Phase 4: Private Cloud Library

Goal: move private saved recipes, settings, recipe history, follow-up metadata, and feedback metadata into account-owned storage while preserving the existing local recovery path.

Scope:

- Backend adapters for account settings, recipe requests, generated recipes, saved recipes, follow-up requests, voice metadata, and feedback events.
- Server routes that call the data access layer only after server-verified identity.
- Browser UI that clearly distinguishes account-synced data from browser-local fallback or recovery data.
- Export and delete flows for private account data, with audit events.

Acceptance criteria:

- Account-owned settings and saved recipes persist across browsers after sign in.
- Anonymous users can still use browser-local settings, saved recipes, feedback, and export/import.
- Raw voice audio is not retained by default.
- Raw transcripts and raw follow-up text remain private and retention-limited if persisted.
- Account export distinguishes private account data from public/community data.
- Account deletion or private data deletion does not silently alter public audit history.

## Phase 5: Public Recipe Publishing

Goal: allow an authenticated user to explicitly publish a sanitized copy of a private saved recipe.

Implementation sequence:

1. Add publish preview for one private saved recipe.
2. Use `src/privacy-governance.mjs` to build a public payload with allowed fields only.
3. Server-side publication writes `public_recipes`, `public_recipe_versions`, `recipe_publications`, and `audit_events` in one controlled operation.
4. Add unpublish or hide controls before broad public testing.
5. Add public read APIs that return published public recipe versions only.

Public recipe sharing readiness acceptance criteria:

- Publishing is never automatic and requires explicit confirmation after preview.
- Private saved recipe records remain private after publishing.
- Public payloads exclude raw prompts, raw ingredients text from private requests, voice transcripts, raw audio, private notes, follow-up questions, personal constraints, provider errors, internal validation failures, and anonymous session ids.
- Public recipe reads fail closed for missing, draft, hidden, removed, or unknown status unless the requester is the owner or an explicit moderator/admin/support role.
- Public recipes can be unpublished or hidden without deleting the user's private saved recipe.
- Searchability follows the human-approved policy: direct-link-only or searchable by default.

## Phase 6: Community Signals

Goal: add first community interactions on published public recipes.

Scope:

- Authenticated likes with one active like per user per public recipe.
- Authenticated private bookmarks of public recipes.
- Report flow with reason categories, optional details, status, moderation role checks, and audit events.
- Aggregate counts that can support ranking without exposing private profile or request data.

Acceptance criteria:

- Likes and bookmarks require authenticated identity.
- One-like and one-bookmark uniqueness is enforced by schema and tests.
- Reports remain internal to moderation/support roles and are not returned from public recipe APIs.
- Open severe reports can reduce discovery exposure according to moderation policy.
- Community event payloads do not include private prompts, transcripts, follow-up questions, avoidances, allergy text, private notes, or anonymous session ids.

## Phase 7: Ranking And People-Also-Liked MVP

Goal: add an explainable first discovery ranking and recommendation path based only on public community data.

Scope:

- Ranking job or service route that combines recent likes, bookmarks, freshness, report state, and approved curation adjustments.
- `recipe_ranking_signals` writes for public interaction events and aggregate ranking inputs.
- People-also-liked recommendations from co-like and co-bookmark patterns between public recipes.
- Public discovery APIs that read only published recipes and sanitized public versions.

Ranking and recommendation MVP readiness acceptance criteria:

- Ranking inputs use public recipe events and sanitized metadata only.
- Reports downrank or hide public recipes according to the moderation policy.
- People-also-liked edges use public likes/bookmarks and never inspect private saved recipes, private request text, account settings, voice transcripts, or follow-up questions.
- Ranking weights are documented and can be tuned without a schema rewrite.
- Recommendation output is bounded, explainable, and filtered to published public recipes.
- Tests prove private fields cannot appear in discovery or recommendation responses.

## Future Execution Task Proposals

These are proposal slices for later task creation, not active implementation tasks:

1. Approve provider/account setup and record environment decisions.
2. Add Supabase local/preview configuration and migration smoke validation.
3. Add server-verified auth session integration and minimal account UI behind flags.
4. Add two-user RLS tests and account profile bootstrap.
5. Add browser-local-to-account import preview and private migration API.
6. Add account-synced settings and private saved recipes.
7. Add account export/delete foundation and audit events.
8. Add public recipe publish preview and sanitizer-backed publication API.
9. Add public recipe read API and direct-link public recipe view.
10. Add likes, bookmarks, reports, and moderation status handling.
11. Add ranking signal aggregation and discovery ordering.
12. Add people-also-liked recommendation edges and public recommendation API.

## Blockers To Resolve Before Implementation

- Provider account creation and project access for local, preview, and production.
- Final approval of privacy notice, publication consent, account export/delete, and account deletion copy.
- Moderation owner, report categories, and response expectations.
- Public recipe searchability policy at launch.
- Public profile handle policy.
- Initial ranking weights and whether recommendations launch with public discovery or later.
- Backup/PITR decision before account beta.
- Support process for account recovery, deletion requests, and public recipe reports.

## Validation Expectations For Later Tasks

Every later roadmap implementation should include:

- `npm.cmd test`.
- Changed-file `node --check` for JavaScript and MJS files.
- `git diff --check`.
- `npx.cmd wrangler deploy --dry-run`.
- Local HTTP smoke when route behavior changes.
- Browser-level desktop and 390px mobile checks when user-facing UI changes.
- Secret and terminology scans for OpenAI keys, Supabase/Clerk secrets, database URLs, accidental technical repository naming in user-facing copy, and storage-location-specific ingredient wording.
- Privacy tests proving public, ranking, recommendation, analytics, and support payloads exclude private request text and sensitive user context.
