# Cookooi Auth Session And Authorization Contract

## Purpose

This document defines the auth/session boundary Cookooi will use when accounts are introduced. It does not enable sign in, account UI, production database writes, public recipe publishing, likes, rankings, or moderation tools.

The current tester build remains anonymous and browser-local by default. Future account work must derive identity on the server and pass only server-verified identity into the request context.

## Identity States

Cookooi supports two request identity states in code today:

| State | Meaning | Current behavior |
| --- | --- | --- |
| `anonymous` | No verified account identity is attached to the request. | Default for every current tester request. Browser-local settings, saved recipes, and feedback continue to work. |
| `authenticated` | The server has verified an account session and mapped it to a Cookooi user id. | Future-only until account integration is implemented. |

Authenticated identities can carry roles:

- `user`: normal account owner role, always present on authenticated identities.
- `moderator`: can perform future community moderation actions.
- `admin`: can perform future administrative actions.
- `support`: can perform future support actions only through explicit support workflows.

Admin, moderator, and support access is not implicit. A route must check a distinct role before reading moderation queues, changing public recipe state, or accessing support-only operations. These roles do not automatically grant access to another user's private recipe data.

## Server-Side Session Derivation

Future account routes should derive identity in this order:

1. Read a server-verifiable session source such as a Supabase Auth cookie or bearer token.
2. Verify the session server-side in the Worker or a trusted backend adapter.
3. Map the provider subject to an internal Cookooi user id.
4. Pass `{ userId, roles }` as `verifiedIdentity` to `createRequestContext`.
5. Use `context.identity.userId` for ownership decisions.

Cookooi must never trust user ids, roles, owner ids, or admin flags sent in browser request bodies, query strings, or headers such as `x-cookooi-user-id`. Client-supplied ids can be display or correlation metadata only after validation; they cannot decide ownership.

## Request Context Contract

`src/request-context.mjs` creates a frozen context with:

- `requestId`
- `startedAt`
- `sessionId`
- `identity`
- `featureFlags`

With no `verifiedIdentity`, the context is anonymous. With a verified server identity, the context is authenticated and role-normalized. Unknown roles are discarded.

Authorization helpers are also defined in `src/request-context.mjs`:

- `authorizePrivateResourceAccess`
- `authorizePrivateResourceWrite`
- `authorizePublicRecipeRead`
- `authorizePublicRecipePublication`
- `authorizeCommunityInteraction`
- `authorizeModerationAction`

These helpers return `{ allowed, reason }` so routes and adapters can fail closed before touching persistent account/community data.

## Private Data Rules

Private data includes:

- user profiles and settings;
- recipe requests;
- generated recipes;
- saved recipes;
- voice-note transcription metadata;
- follow-up requests;
- feedback events tied to an account;
- private notes and migration imports.

Rules:

- Anonymous users can keep using browser-local settings, saved recipes, feedback, and session export/import.
- Server-side account persistence requires an authenticated context.
- Reads and writes for private rows require the authenticated user's `context.identity.userId` to match the row owner.
- Service adapters should derive owner fields from `context.identity.userId`, not from client-submitted payload ids.
- Support, moderator, and admin roles do not bypass private ownership by default. Any exception needs a separate reviewed support/admin route and an audit event.

## Public And Community Rules

Public/community data is intentionally different from private data:

| Capability | Authorization rule |
| --- | --- |
| Read published public recipes | Allowed to anonymous and authenticated users when public recipe flags are enabled. |
| Read draft, hidden, or removed public recipes | Owner, moderator, admin, or support role only. |
| Publish a saved recipe publicly | Authenticated owner only, through a sanitizer that copies public fields into public recipe/version rows. |
| Like or bookmark a public recipe | Authenticated user only. |
| Report a public recipe | Authenticated user only for the first implementation unless a later reviewed task creates anonymous abuse controls. |
| Moderate reports or hide/restore public recipes | `moderator`, `admin`, or `support` role only. |
| Write ranking counters or recommendation edges | Trusted server/background job only; never direct browser input. |

Public recipe payloads must not include raw prompts, raw ingredients text from private requests, private notes, follow-up questions, voice transcripts, raw audio, anonymous session ids, provider errors, or personal constraints. See `docs/account-community-architecture.md` and `docs/database-schema-baseline.md` for the public/private schema boundary.

## Feature Flags

The Task 31 flags remain default-off:

```text
COOKOOI_ACCOUNTS_ENABLED=false
COOKOOI_SERVER_LIBRARY_ENABLED=false
COOKOOI_PUBLIC_RECIPES_ENABLED=false
COOKOOI_COMMUNITY_SIGNALS_ENABLED=false
```

When flags are off, current behavior is unchanged. When account/community flags are enabled in a later task, service calls still require the authorization rules above before adapter methods run.

## Implementation Notes For Future Tasks

- Add real Supabase/Clerk verification only in a later account integration task.
- Keep service-role keys and database URLs server-side only.
- Add two-user authorization tests before exposing browser database access.
- Add audit events for publication, moderation, support access, account deletion, and imports.
- Keep anonymous-to-account migration opt-in and private-first.

## Validation

`test/data-access-layer.test.mjs` covers the current scaffold:

- client-supplied user ids are ignored;
- verified server identity is the only path to authenticated context;
- private ownership checks require the same user id;
- public recipe reads are distinct from private data reads;
- moderation requires a distinct role;
- enabled account/community service writes fail closed for anonymous context.
