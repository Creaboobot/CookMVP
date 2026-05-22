# Cookooi Privacy, Consent, And Retention Backbone

## Purpose

This document defines Cookooi's data governance baseline before account storage or public recipe sharing is enabled. It extends the account/community architecture, auth boundary, database baseline, and disabled data access layer without adding account UI, public recipe UI, live database writes, or legal final copy.

The operating rule is privacy first: private cooking assistance stays private, public/community recipe data is a sanitized copy created only after explicit publication consent, and analytics use metadata that cannot reconstruct the user's raw request.

## Current Testing Data

Current Cookooi testing has no accounts and no server-side persistence for saved recipes, settings, feedback, or public recipes. The browser stores:

| Browser-local record | Data stored | Current retention |
| --- | --- | --- |
| `cookooi-session-v1` | anonymous local session id | until the tester clears session data or browser data |
| `cookooi-settings-v1` | baseline settings such as avoidances, diet, meal type, servings, time, cuisine or flavor, and equipment | until Reset Settings or browser data clear |
| `cookooi-library-v1` | saved recipe objects, saved timestamps, generation links, and source metadata | until clear saved recipes, import replacement data, or browser data clear |
| `cookooi-feedback-v1` | generation records, follow-up records, recipe ratings, optional tester notes, saved-recipe markers, source/model metadata, counts, lengths, booleans, and selected non-sensitive options | until clear session data, import replacement data, or browser data clear |

Immediate server processing:

- Recipe generation receives the ingredients the user has, craving text, settings-derived constraints, and voice-note interpretation fields for one response.
- Per-meal follow-up refinement receives the selected recipe and one follow-up question for one response.
- Voice transcription receives one short audio upload and returns a transcript for user review.
- The current app does not persist raw audio on the server, and the transcript remains editable on the page before generation.

## Data Classification

| Data class | Examples | Default visibility | Persistence rule |
| --- | --- | --- | --- |
| Transient processing data | raw voice audio upload, one-off provider request body | private processing only | do not retain by default |
| Private account data | settings, recipe requests, generated recipes, saved recipes, private notes, follow-up requests, voice transcript metadata | user only | persist only after account feature review and server-verified identity |
| Privacy-safe metadata | counts, lengths, booleans, selected non-sensitive options, source/model, success/failure, recipe ids | private or internal aggregate | allowed for feedback/analytics when raw text is not included |
| Sanitized public recipe data | public recipe title, summary, ingredients used, items still needed, steps, general recipe notes, safety notes | public after consent | created only from an explicit publish action and sanitization pass |
| Community event data | likes, bookmarks, reports, ranking signals | public aggregate or user-private according to feature | must not include private constraints or raw request text |
| Operational audit data | publication, unpublication, report resolution, export, deletion, support actions | internal | retain enough to operate and debug without raw sensitive text |

## Retention Rules

These retention rules are product defaults for future account/community work. Legal finalization can tighten them later, but later implementation tasks should not weaken them without a reviewed product decision.

| Data | Default retention |
| --- | --- |
| Raw voice audio | Not retained by default. Process the upload, return a transcript, then discard. Any diagnostic audio retention requires a separate explicit opt-in task and a short retention window. |
| Voice transcript | Current MVP keeps transcript text only in the browser page for review. Future server transcript persistence must be private, consented, and capped at 30 days unless the user explicitly saves it as part of a private recipe note. |
| Recipe requests | Browser-local for the current MVP. Future account records are private and retained until the user deletes the request/account or a retention job removes old anonymous migration records. |
| Generated recipes | Browser-local until saved or exported in the current MVP. Future account records are private and retained until user deletion/account deletion. |
| Saved recipes | Browser-local until user clear/import/browser clear in the current MVP. Future account saved recipes are private until the user deletes them; publishing creates a separate sanitized public copy and does not change the private record's visibility. |
| Follow-up requests | Current session metadata stores success/failure and lengths, not raw questions. Future raw follow-up text is private and should be deleted with the related private recipe/request. |
| Feedback and analytics | Store privacy-safe metadata only by default. Future server analytics should default to a 180-day retention window unless a reviewed operations task chooses a shorter or longer aggregate-only policy. |
| Public recipes and public versions | Retain while published and after unpublish only as needed for user controls, moderation, and audit. Public versions must not include private prompt, transcript, private notes, follow-up questions, or personal constraints. |
| Reports and moderation records | Keep report details internal. Retain for moderation history and abuse prevention, defaulting to 365 days for operational records unless legal review changes it. |
| Audit events | Retain publication, deletion, export, moderation, support, and account migration events for 365 days by default, with no raw sensitive text unless a later compliance task explicitly requires it. |

Anonymous-to-account migration should keep browser-local data private and import only after user consent. Any server-side anonymous migration staging should expire after 30 days by default.

## Consent Requirements

Cookooi requires explicit consent for these actions:

- importing browser-local tester data into an account;
- publishing a private saved recipe as a public recipe;
- creating an account data export;
- deleting account-owned data or starting account deletion.

Consent must be an affirmative user action in context. It cannot be inferred from saving a recipe, rating a recipe, using voice input, asking a follow-up question, creating an account, or accepting general testing instructions.

## Publication Consent Flow

Publication is never automatic. A future publish flow must follow this sequence:

1. User chooses a private saved recipe and starts Publish.
2. Cookooi builds a preview using only public recipe fields.
3. Cookooi clearly labels fields that will become public and fields that will stay private.
4. User confirms publication with an explicit action after viewing the preview.
5. Server-side publication code sanitizes the source recipe again before writing public rows.
6. Cookooi writes `public_recipes`, `public_recipe_versions`, `recipe_publications`, and an `audit_events` row in one controlled operation.
7. Ranking and community interactions start only after the public recipe status is `published`.

Unpublishing hides or removes the public recipe surface without deleting the user's private saved recipe. Deleting the private saved recipe should not silently delete public audit history; future account deletion work must define the exact public-content handling before launch.

## Public Sanitization Rules

Public recipe payloads may include:

- title;
- summary;
- uses from available items;
- items still needed;
- preparation steps;
- prep and cook times;
- servings;
- difficulty;
- general dietary notes;
- general allergy notes written as recipe content;
- food-safety notes;
- substitutions.

Public recipe payloads must not include:

- raw audio;
- voice transcripts;
- raw prompts;
- raw ingredients text from the private request;
- cravings;
- avoidances, dislikes, allergy lists, or personal dietary restrictions from the private request;
- household details;
- private notes;
- follow-up questions;
- anonymous session ids;
- provider errors;
- internal validation failures;
- precise analytics context that can reconstruct the private request.

General public-facing recipe notes such as "contains dairy" are allowed when they describe the recipe. They must not reveal that a specific user has an allergy or private constraint.

## Analytics And Feedback Rules

Cookooi analytics and feedback should follow the existing metadata-only pattern:

- allowed: event type, schema version, anonymous session id, recipe id, generation id, source, provider, model, success/failure, recipe count, follow-up count, rating, note length, item counts, text lengths, selected diet/meal type, servings, time, equipment count, and timestamps;
- not allowed by default: raw ingredients, craving text, avoidances, allergy text, voice transcript, raw prompt, raw follow-up question, private notes, or full feedback note text.

Anonymous session id is allowed only as analytics metadata. It must not be copied into public recipe payloads, exports of public recipe data, ranking payloads, or any analytics event that also contains raw sensitive text.

Optional tester notes currently remain browser-local. Future server-side feedback storage must either keep notes private with explicit consent or continue storing only note length and categorical ratings.

## Export And Deletion Expectations

Future account work should provide:

- export of private profile/settings, saved recipes, generated recipe history where retained, feedback metadata, publication records, and public recipes owned by the user;
- deletion of private account data owned by the user;
- unpublish or ownership-handling rules for public recipes before account deletion;
- audit records for export, deletion request, deletion completion, and any failed deletion step.

Exports must distinguish private data from public/community data. Public exports must not include private prompts, transcripts, private notes, follow-up questions, personal constraints, or anonymous migration ids.

## Report And Moderation Workflow

Public recipe reports must remain internal to moderation and support roles. A future report flow should:

1. accept a public recipe id, public version id, report reason, optional details, and reporter identity;
2. store report details privately;
3. reduce or hide discovery exposure for open severe reports when policy requires it;
4. allow moderator/admin/support roles to mark reports reviewed, actioned, or dismissed;
5. record status changes in `audit_events`;
6. keep report details out of public recipe APIs, ranking payloads, and public exports.

Moderation access must use the explicit roles from `docs/auth-session-authorization.md`. It is not implied by ordinary account ownership.

## Code Constants

`src/privacy-governance.mjs` records the first code-level governance constants:

- consent actions requiring explicit user action;
- retention defaults for audio, transcripts, private recipes, feedback analytics, public recipes, and audit events;
- public recipe allowed fields;
- fields blocked from public recipes;
- analytics-safe event fields;
- helper functions for future publication and analytics sanitization.

The constants do not enable accounts, public recipes, live persistence, moderation tools, or any user-facing workflow. They exist so future implementation tasks and tests can share the same privacy boundary.

## Validation Checklist For Later Tasks

Future account, publication, analytics, and moderation tasks should prove:

- feature flags stay off until the reviewed feature is ready;
- server identity is verified before private persistence;
- raw audio is discarded by default;
- publication has explicit consent and preview;
- public payloads exclude raw prompts, transcripts, private notes, follow-up questions, personal constraints, and anonymous session ids;
- analytics payloads use counts, lengths, booleans, categories, and ids instead of raw sensitive text;
- export/delete/report actions write audit events without secrets or raw sensitive text;
- docs and tests use Cookooi naming and avoid storage-location-specific wording for ingredients.
