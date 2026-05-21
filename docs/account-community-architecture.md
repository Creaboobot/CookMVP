# Cookooi Account And Community Data Architecture

## Purpose

This document defines the target account, recipe, and community data model for Cookooi. It is a design foundation for later implementation tasks; it does not add auth, database tables, public recipe screens, likes, sharing, rankings, or migration code.

The core product boundary is simple: private cooking assistance and future public/community discovery are separate systems that may share sanitized recipe content only after an explicit publication action.

## Architecture Principles

- Private user context is private by default.
- Public recipe content is a sanitized derivative, not a live view of the private saved recipe.
- Publishing is explicit, reversible at the public layer, and auditable.
- Allergy, avoidance, household, transcript, prompt, private note, and follow-up context never become public by default.
- Public ranking and recommendation signals use community events and sanitized public recipe metadata, not personal constraints or raw request text.
- Every persisted payload that can evolve has a schema version and a migration path.
- Anonymous test-session data can be migrated into an account only after user consent.

## Current Prototype Baseline

Cookooi currently stores first-pass testing data in browser-local records:

- `cookooi-session-v1`: anonymous local session id.
- `cookooi-settings-v1`: baseline recipe settings such as avoidances, diet, meal type, servings, available time, cuisine or flavor, and equipment.
- `cookooi-library-v1`: saved recipe entries with full recipe detail and source metadata.
- `cookooi-feedback-v1`: generation records, follow-up records, recipe ratings, and saved-recipe markers.

The current prototype has no accounts and no server-side persistence for saved recipes, settings, feedback, or community features. Future tasks should migrate from this baseline without changing the privacy meaning of these records.

## Data Boundary Model

Cookooi has three data zones:

| Zone | Examples | Default visibility | Notes |
| --- | --- | --- | --- |
| Private account data | profile, settings, private requests, generated recipes, saved recipes, private notes, follow-up requests | user only | May contain sensitive constraints and raw user intent. |
| Sanitized publication data | public recipe, public recipe versions, publication metadata | public after explicit publish | Derived from a private saved recipe through a sanitization step. |
| Community event data | likes, bookmarks, reports, ranking signals, aggregate recommendation edges | public or aggregate | Must not include private prompt text or private constraints. |

Private and public records should not share mutable row identity. A public recipe points back to a publication record for audit, but public readers do not receive the source private request, settings, transcript, or notes.

## Recipe Lifecycle

Cookooi recipes move through these states:

| State | Owner | Public? | Description |
| --- | --- | --- | --- |
| Generated private | user or anonymous session | no | Recipe proposal returned for one request. It may be discarded without saving. |
| Saved private | user or anonymous session | no | User saves a generated recipe to their private library. |
| Published public | user account | yes | User explicitly publishes a sanitized copy of a saved private recipe. |
| Public version | public recipe | yes | Immutable revision of public title, summary, ingredients, steps, notes, and metadata. |
| Reported/hidden | public recipe | limited or no | Recipe is reported, under moderation, hidden from discovery, or removed from public lists. |

Private saved recipes remain editable and private even after publication. Public recipes use immutable versions so moderation, ranking, and future comments can anchor to the exact public content seen by users.

## Entity Overview

### `users`

Account identity record.

Core fields:

- `id`
- `auth_provider`
- `auth_subject`
- `email_normalized`
- `created_at`
- `last_seen_at`
- `status`: `active`, `disabled`, `deleted_pending`

Rules:

- Do not store provider secrets in this table.
- Use a stable internal user id rather than exposing provider ids in public URLs.

### `user_profiles`

Public-facing and private profile preferences that are safe to keep separate from auth identity.

Core fields:

- `user_id`
- `display_name`
- `handle`
- `avatar_url`
- `profile_visibility`
- `created_at`
- `updated_at`

Rules:

- Display name and handle are public only when the user opts into public community features.
- Profile records must not include allergies, household context, private notes, or raw cooking constraints.

### `recipe_requests`

Private structured request submitted to generation.

Core fields:

- `id`
- `user_id` or `anonymous_session_id`
- `schema_version`
- `ingredients_text`
- `craving`
- `constraints_json`
- `previous_recipe_titles_json`
- `source`: `typed`, `voice_transcript`, `imported`
- `created_at`

Rules:

- Private by default.
- Not copied into public records.
- Apply retention limits for anonymous sessions.
- Constraints can include allergy and avoidance information and must be treated as sensitive.

### `generated_recipes`

Private generated proposal returned by Cookooi.

Core fields:

- `id`
- `recipe_request_id`
- `user_id` or `anonymous_session_id`
- `schema_version`
- `recipe_json`
- `source`
- `provider`
- `model`
- `created_at`
- `validation_status`

Rules:

- Private by default.
- May become the source for a saved recipe.
- Store generated output separately from public recipes so later public edits do not mutate private history.

### `saved_recipes`

Private user library entry.

Core fields:

- `id`
- `user_id`
- `generated_recipe_id`
- `schema_version`
- `recipe_json`
- `private_notes`
- `tags_json`
- `saved_at`
- `updated_at`

Rules:

- Private by default.
- Private notes must never be copied into public recipes.
- Saving a generated recipe does not publish it.

### `public_recipes`

Public recipe identity and discovery record.

Core fields:

- `id`
- `owner_user_id`
- `current_version_id`
- `status`: `draft_publication`, `published`, `hidden`, `removed`
- `slug`
- `published_at`
- `updated_at`
- `hidden_at`

Rules:

- Contains only public metadata and pointers to public versions.
- Does not contain private settings, prompts, transcripts, follow-up questions, or private notes.
- Can be hidden from discovery without deleting audit history.

### `public_recipe_versions`

Immutable public recipe content revision.

Core fields:

- `id`
- `public_recipe_id`
- `version_number`
- `schema_version`
- `title`
- `summary`
- `uses_from_available_items_json`
- `items_still_needed_json`
- `steps_json`
- `prep_time_minutes`
- `cook_time_minutes`
- `servings`
- `difficulty`
- `dietary_notes_json`
- `allergy_notes_json`
- `food_safety_notes_json`
- `substitutions_json`
- `created_at`

Rules:

- All public display should read from a version row.
- Content is sanitized before insert.
- Later edits create a new version rather than mutating the prior version.

### `recipe_publications`

Audit and bridge record for publishing a private saved recipe into public/community space.

Core fields:

- `id`
- `user_id`
- `saved_recipe_id`
- `public_recipe_id`
- `public_recipe_version_id`
- `sanitization_version`
- `publication_status`: `pending`, `published`, `rejected`, `unpublished`
- `created_at`
- `published_at`
- `unpublished_at`

Rules:

- This is the only allowed bridge from private saved recipe to public recipe.
- Publication requires explicit user action and a sanitization pass.
- Keep enough audit context to explain which private recipe created the public copy without exposing that context publicly.

### `recipe_likes`

Positive community reaction to a public recipe.

Core fields:

- `id`
- `public_recipe_id`
- `user_id`
- `created_at`

Rules:

- One active like per user per public recipe.
- Likes affect ranking signals but should not expose private profile data beyond normal public aggregate counts.

### `recipe_bookmarks`

Private save/bookmark of a public recipe by a user.

Core fields:

- `id`
- `public_recipe_id`
- `user_id`
- `created_at`

Rules:

- Bookmark lists are private by default.
- Aggregate bookmark counts may be used for ranking.
- Bookmarking a public recipe is separate from saving a private generated recipe.

### `recipe_reports`

Moderation report for public recipe content.

Core fields:

- `id`
- `public_recipe_id`
- `public_recipe_version_id`
- `reporter_user_id`
- `reason`
- `details`
- `status`: `open`, `reviewed`, `actioned`, `dismissed`
- `created_at`
- `resolved_at`

Rules:

- Reports can move a public recipe into `hidden` or `removed`.
- Report details are not public.
- Moderation actions should be copied into `audit_events`.

### `ranking_signals`

Derived events and aggregates used for discovery order, trending lists, and people-also-liked recommendations.

Core fields:

- `id`
- `public_recipe_id`
- `signal_type`: `like`, `bookmark`, `view`, `report`, `freshness`, `quality_adjustment`, `co_like_edge`
- `actor_user_id` when allowed
- `related_public_recipe_id` for recommendation edges
- `weight`
- `created_at`
- `expires_at`

Rules:

- Ranking inputs must come from public recipe interactions or sanitized metadata.
- Reports should reduce discovery exposure while under review.
- People-also-liked recommendations should be computed from public likes/bookmarks and should not use private recipe requests, private settings, or raw prompt text.

### `feedback_events`

Product feedback and lightweight analytics event record.

Core fields:

- `id`
- `user_id` or `anonymous_session_id`
- `event_type`
- `schema_version`
- `event_json`
- `created_at`

Rules:

- Continue the current privacy pattern: store metadata such as counts, lengths, booleans, selected non-sensitive options, source, model, and success/failure.
- Do not store raw ingredients, cravings, voice transcripts, avoidances, free-text cuisine/flavor preferences, raw follow-up questions, or private notes by default.

### `follow_up_requests`

Private per-meal refinement request and response metadata.

Core fields:

- `id`
- `user_id` or `anonymous_session_id`
- `generated_recipe_id` or `saved_recipe_id`
- `schema_version`
- `question`
- `response_json`
- `source`
- `provider`
- `model`
- `created_at`

Rules:

- Private by default.
- Raw follow-up question must not be included in public recipes, public recipe versions, or community ranking signals.
- If product analytics need follow-up insight, use metadata in `feedback_events`.

### `audit_events`

Security, privacy, publication, moderation, and administrative audit trail.

Core fields:

- `id`
- `actor_user_id`
- `target_type`
- `target_id`
- `action`
- `metadata_json`
- `created_at`

Rules:

- Required for publication, unpublication, version creation, report resolution, account deletion, and data export.
- Metadata should avoid secrets and raw sensitive text unless a future compliance decision explicitly requires it.

### Optional Later Entities

Later tasks may add `public_recipe_comments`, `user_follows`, `collections`, `moderation_reviews`, and `data_export_jobs`. These should follow the same split: private account data stays private, public community content is intentionally published, and operational audit records are not exposed as product content.

## Publication Rules

Publishing a private saved recipe should follow this sequence:

1. User selects a private saved recipe and chooses to publish.
2. Cookooi shows a publication preview with only public fields.
3. Sanitization removes private source context:
   - allergies and avoidances from the original request unless the user writes general public-facing caveats;
   - household details;
   - voice transcripts;
   - raw prompts;
   - private notes;
   - follow-up questions;
   - provider error details;
   - anonymous session ids.
4. Cookooi creates `public_recipes`, `public_recipe_versions`, and `recipe_publications` rows in one transaction.
5. Cookooi writes an `audit_events` row.
6. Ranking starts only after the public recipe reaches `published`.

Public recipe content may include general allergy and food-safety caveats that are part of the recipe itself, such as "contains dairy" or "check labels for packaged ingredients." It must not reveal the user's personal allergy list or private constraints unless a later product decision creates an explicit, reviewed field for voluntary public notes.

## Data That Must Never Be Public By Default

These fields and concepts must not be copied to public recipe rows, public versions, public profile rows, ranking signals, public exports, or community APIs by default:

- allergies;
- dietary restrictions;
- household details;
- voice transcripts;
- raw audio;
- raw prompts;
- raw ingredients text from the request;
- private notes;
- follow-up questions;
- avoidances and dislikes;
- anonymous session ids;
- provider errors;
- internal validation failures;
- precise local analytics context that can reconstruct the request.

If a later feature needs to expose any related information, it requires a separate task with explicit product, privacy, and review approval.

## Schema And Versioning Rules

Every JSON payload persisted by Cookooi should include or be tied to a schema version.

| Payload | Version field | Compatibility rule |
| --- | --- | --- |
| Recipe requests | `recipe_requests.schema_version` | Preserve source fields needed to regenerate or audit private output. Additive fields should default safely. |
| Recipe outputs | `generated_recipes.schema_version` and `public_recipe_versions.schema_version` | Public versions are immutable; new public display fields require new versions or default display fallbacks. |
| Settings | settings JSON `version` | Migrate browser-local `cookooi-settings-v1` into account settings only after consent. Unknown options should be ignored or mapped. |
| Transcripts | transcription metadata version if persisted later | Raw transcript storage is out of current scope. If later persisted, it must be private, consented, and retention-limited. |
| Saved recipes | `saved_recipes.schema_version` | Preserve current full recipe object and source metadata; future fields should not break existing exports. |
| Public recipes | `public_recipe_versions.schema_version` | Versioned public content must be renderable without reading private source rows. |
| Feedback events | `feedback_events.schema_version` | Store privacy-preserving metadata only unless a later task changes policy. |

Migration tasks should include:

- forward migration for existing browser-local export JSON;
- rollback or read-compatibility plan;
- privacy review of any field moving from local-only to server-side;
- test fixtures for old and new versions.

## Anonymous-To-Account Migration

Anonymous tester data may become account-owned only after a clear user action such as sign up, sign in, and confirm import.

Migration principles:

- Keep the anonymous session id as an internal migration reference, not a public id.
- Let the user choose whether to import saved recipes, settings, and feedback metadata.
- Treat saved recipes and settings as private after import.
- Do not import raw transcripts or raw follow-up text unless a later consent model explicitly adds them.
- Deduplicate saved recipes by normalized title plus summary or recipe id.
- Preserve source/provider/model metadata so generated content remains traceable.
- Write `audit_events` for migration start, success, and failure.

## Ranking And Recommendation Model

Initial ranking should be simple and explainable:

- hide or strongly downrank reported public recipes while moderation is open;
- rank by recent likes, bookmarks, and freshness;
- apply quality adjustments from moderation or product curation;
- avoid using private user constraints as ranking features.

People-also-liked recommendations should use co-like and co-bookmark patterns between public recipes. The recommendation job may create `ranking_signals` with `signal_type = "co_like_edge"` and a `related_public_recipe_id`. It must not inspect private saved recipes, private request text, or account settings.

## MVP And Later-Phase Scope

### Prototype / Current MVP

- Browser-local settings, saved recipes, feedback metadata, and session export/import.
- Server-side generation, refinement, and voice transcription.
- No accounts.
- No live database tables.
- No public recipe discovery.
- No community likes, bookmarks, reports, or rankings.

### Account Foundation

- Add auth provider integration.
- Add `users` and `user_profiles`.
- Move settings and private saved recipes into account-owned records.
- Preserve browser-local import/export as a recovery path.
- Add account deletion and export audit events.

### Private Cloud Library

- Add `recipe_requests`, `generated_recipes`, `saved_recipes`, `follow_up_requests`, and `feedback_events`.
- Keep request text and sensitive constraints private.
- Add compatibility migrations from browser-local records.

### Publication Foundation

- Add `public_recipes`, `public_recipe_versions`, and `recipe_publications`.
- Build explicit publish preview and sanitization.
- Add unpublish and hidden states.
- Add moderation audit events.

### Community Discovery

- Add likes, bookmarks, reports, ranking signals, and public browse/search APIs.
- Add people-also-liked recommendations from public community interactions.
- Add moderation queues and public recipe quality controls.

## Open Decisions Needing Human Confirmation

- Final auth provider and database strategy are intentionally left to the follow-up backend strategy task.
- Whether public user profiles should require unique handles before the first public recipe.
- Whether public recipes can display optional creator-written allergy or diet notes, and how those notes are reviewed.
- Moderation SLA and who can hide or restore reported recipes.
- Whether public bookmark lists ever become shareable collections.
- Initial ranking weights for likes, bookmarks, freshness, reports, and curation.
- Data retention period for anonymous sessions after account migration.

## Implementation Guidance For Later Agents

- Do not implement public/community tables before the auth and database strategy is approved.
- Keep account migration private-first; do not turn existing saved recipes into public recipes automatically.
- Treat publication as a copy-and-sanitize workflow, not a visibility toggle on `saved_recipes`.
- Add tests for every privacy boundary: no raw prompts, transcripts, private notes, follow-up questions, or personal constraints in public APIs.
- Use Cookooi naming in user-facing copy and storage-location-neutral wording for ingredients and available items.
