# Cookooi Data Access Layer And Feature Flags

## Purpose

This document records the first Cookooi service boundary for future account and community work. The code added for this boundary does not enable accounts, server-side saved recipes, public recipe sharing, likes, bookmarks, reports, or rankings.

Current tester behavior remains browser-local by default. The server can create a request context and call data-service hooks, but those hooks are disabled unless explicit feature flags are enabled and a later task provides a backend adapter.

## Feature Flags

The account and community flags are off by default:

```text
COOKOOI_ACCOUNTS_ENABLED=false
COOKOOI_SERVER_LIBRARY_ENABLED=false
COOKOOI_PUBLIC_RECIPES_ENABLED=false
COOKOOI_COMMUNITY_SIGNALS_ENABLED=false
```

Flag gates:

| Capability | Required flags | Default behavior |
| --- | --- | --- |
| Account-owned profiles, recipe requests, saved recipes, follow-ups, voice metadata, and feedback events | `COOKOOI_ACCOUNTS_ENABLED=true` and `COOKOOI_SERVER_LIBRARY_ENABLED=true` | Service calls return disabled or empty results. |
| Public recipe reads or publication service calls | `COOKOOI_ACCOUNTS_ENABLED=true` and `COOKOOI_PUBLIC_RECIPES_ENABLED=true` | Public recipe reads return an empty list and publication calls return disabled. |
| Community likes, bookmarks, and reports | `COOKOOI_ACCOUNTS_ENABLED=true`, `COOKOOI_PUBLIC_RECIPES_ENABLED=true`, and `COOKOOI_COMMUNITY_SIGNALS_ENABLED=true` | Interaction calls return disabled. |

These flags are intentionally conservative. A partial flag combination should not expose unfinished account, public recipe, or community behavior.

## Server Modules

Server-side modules:

- `src/feature-flags.mjs`: parses the Cookooi feature flags and exposes gate helpers.
- `src/request-context.mjs`: creates an anonymous request context with request id, timestamp, session id, identity state, and feature flags.
- `src/data-services.mjs`: exposes service groups for user profiles, recipe requests, saved recipes, follow-up requests, voice-note metadata, feedback events, public recipes, and community interactions.

The current request context is anonymous only. It does not trust client-provided user ids. A later auth task can extend this context after server-side session verification exists.

The API handlers for generation, follow-up refinement, and voice transcription now create a request context and call disabled-by-default service hooks. With flags off, these hooks do not call backend adapters and do not alter response behavior.

## Browser Local-Only Adapter

`public/local-data-services.js` wraps the current browser-local stores:

- settings through `settings-store.js`;
- saved recipes through `session-store.js`;
- feedback, generation, follow-up, and saved markers through `feedback-store.js`.

The same adapter exposes disabled placeholders for user profiles, raw recipe-request persistence, public recipes, and community interactions. This preserves the current MVP privacy boundary: saved recipes, settings, and feedback remain browser-local until a later account task explicitly enables server persistence.

## Backend Adapter Contract

Future backend adapters should implement only the service methods they need:

```js
const adapters = {
  userProfiles: {
    getCurrentProfile(context) {},
    upsertProfile(context, profile) {},
  },
  recipeRequests: {
    recordRecipeRequest(context, recipeRequest, metadata) {},
  },
  savedRecipes: {
    listSavedRecipes(context) {},
    saveRecipe(context, savedRecipe) {},
  },
  followUpRequests: {
    recordFollowUpRequest(context, followUpRequest, metadata) {},
  },
  voiceNotes: {
    recordTranscriptionMetadata(context, transcriptionMetadata) {},
  },
  feedbackEvents: {
    recordFeedbackEvent(context, feedbackEvent) {},
  },
  publicRecipes: {
    listPublicRecipes(context, query) {},
    publishRecipe(context, publicationRequest) {},
  },
  interactions: {
    recordLike(context, publicRecipeId) {},
    recordBookmark(context, publicRecipeId) {},
    recordReport(context, report) {},
  },
};
```

Adapters must keep private prompt text, voice transcripts, private notes, follow-up questions, and personal constraints out of public recipe and community paths. Server-side service-role work should stay behind Worker routes and should not expose service keys or database URLs to browser code.

## Validation

`test/data-access-layer.test.mjs` verifies:

- feature flags default off;
- disabled services return empty or disabled results;
- enabled flag combinations call matching adapters only;
- request context remains anonymous and ignores client-supplied user ids;
- local-only services preserve saved recipes, settings, feedback, follow-up metadata, and disabled public/community behavior;
- disabled backend flags do not alter generation, follow-up, or voice transcription route responses.
