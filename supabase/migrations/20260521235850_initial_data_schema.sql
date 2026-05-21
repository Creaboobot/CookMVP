-- Cookooi initial Supabase schema baseline.
-- This migration is intentionally schema-only. It does not enable account UI,
-- public recipe screens, or runtime database access from the current app.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  auth_provider text not null default 'supabase',
  auth_subject text not null,
  email_normalized text,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'deleted_pending')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  deleted_at timestamptz,
  unique (auth_provider, auth_subject)
);

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text,
  handle text unique,
  avatar_url text,
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (handle is null or handle = lower(handle))
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  settings_json jsonb not null default '{}'::jsonb,
  migrated_from_anonymous_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  anonymous_session_id text,
  schema_version integer not null default 1 check (schema_version > 0),
  ingredients_text text not null,
  craving text,
  constraints_json jsonb not null default '{}'::jsonb,
  previous_recipe_titles_json jsonb not null default '[]'::jsonb,
  source text not null default 'typed'
    check (source in ('typed', 'voice_transcript', 'imported')),
  settings_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_session_id is not null)
);

create table if not exists public.voice_note_transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  anonymous_session_id text,
  recipe_request_id uuid references public.recipe_requests(id) on delete set null,
  schema_version integer not null default 1 check (schema_version > 0),
  source text not null default 'in_app_recorder'
    check (source in ('in_app_recorder', 'manual_transcript', 'imported')),
  provider text,
  model text,
  audio_mime_type text,
  audio_size_bytes integer check (audio_size_bytes is null or audio_size_bytes >= 0),
  transcript_char_count integer check (transcript_char_count is null or transcript_char_count >= 0),
  parsed_fields_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz,
  check (user_id is not null or anonymous_session_id is not null)
);

create table if not exists public.generated_recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_request_id uuid not null references public.recipe_requests(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  anonymous_session_id text,
  schema_version integer not null default 1 check (schema_version > 0),
  recipe_json jsonb not null,
  source text not null default 'ai'
    check (source in ('ai', 'fallback', 'imported')),
  provider text,
  model text,
  validation_status text not null default 'validated'
    check (validation_status in ('validated', 'needs_review', 'rejected')),
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_session_id is not null)
);

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  generated_recipe_id uuid references public.generated_recipes(id) on delete set null,
  schema_version integer not null default 1 check (schema_version > 0),
  recipe_json jsonb not null,
  private_notes text,
  tags_json jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted_pending')),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follow_up_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  anonymous_session_id text,
  generated_recipe_id uuid references public.generated_recipes(id) on delete set null,
  saved_recipe_id uuid references public.saved_recipes(id) on delete set null,
  schema_version integer not null default 1 check (schema_version > 0),
  question text not null,
  response_json jsonb not null default '{}'::jsonb,
  source text not null default 'ai'
    check (source in ('ai', 'fallback', 'imported')),
  provider text,
  model text,
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_session_id is not null),
  check (generated_recipe_id is not null or saved_recipe_id is not null)
);

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  anonymous_session_id text,
  event_type text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  event_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_session_id is not null)
);

create table if not exists public.public_recipes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  current_version_id uuid,
  status text not null default 'draft_publication'
    check (status in ('draft_publication', 'published', 'hidden', 'removed')),
  slug text not null unique,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  hidden_at timestamptz,
  check (slug = lower(slug))
);

create table if not exists public.public_recipe_versions (
  id uuid primary key default gen_random_uuid(),
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  schema_version integer not null default 1 check (schema_version > 0),
  title text not null,
  summary text not null,
  uses_from_available_items_json jsonb not null default '[]'::jsonb,
  items_still_needed_json jsonb not null default '[]'::jsonb,
  steps_json jsonb not null default '[]'::jsonb,
  prep_time_minutes integer check (prep_time_minutes is null or prep_time_minutes >= 0),
  cook_time_minutes integer check (cook_time_minutes is null or cook_time_minutes >= 0),
  servings integer check (servings is null or servings > 0),
  difficulty text,
  dietary_notes_json jsonb not null default '[]'::jsonb,
  allergy_notes_json jsonb not null default '[]'::jsonb,
  food_safety_notes_json jsonb not null default '[]'::jsonb,
  substitutions_json jsonb not null default '[]'::jsonb,
  publication_sanitizer_version integer not null default 1 check (publication_sanitizer_version > 0),
  created_at timestamptz not null default now(),
  unique (public_recipe_id, version_number)
);

alter table public.public_recipes
  add constraint public_recipes_current_version_fk
  foreign key (current_version_id)
  references public.public_recipe_versions(id)
  deferrable initially deferred;

create table if not exists public.recipe_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  saved_recipe_id uuid not null references public.saved_recipes(id) on delete restrict,
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  public_recipe_version_id uuid not null references public.public_recipe_versions(id) on delete restrict,
  sanitization_version integer not null default 1 check (sanitization_version > 0),
  publication_status text not null default 'pending'
    check (publication_status in ('pending', 'published', 'rejected', 'unpublished')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unpublished_at timestamptz,
  unique (saved_recipe_id, public_recipe_id)
);

create table if not exists public.recipe_likes (
  id uuid primary key default gen_random_uuid(),
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (public_recipe_id, user_id)
);

create table if not exists public.recipe_bookmarks (
  id uuid primary key default gen_random_uuid(),
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (public_recipe_id, user_id)
);

create table if not exists public.recipe_reports (
  id uuid primary key default gen_random_uuid(),
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  public_recipe_version_id uuid references public.public_recipe_versions(id) on delete set null,
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.recipe_ranking_signals (
  id uuid primary key default gen_random_uuid(),
  public_recipe_id uuid not null references public.public_recipes(id) on delete cascade,
  signal_type text not null
    check (signal_type in ('like', 'bookmark', 'view', 'report', 'freshness', 'quality_adjustment', 'co_like_edge')),
  actor_user_id uuid references public.users(id) on delete set null,
  related_public_recipe_id uuid references public.public_recipes(id) on delete cascade,
  weight numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  target_type text not null,
  target_id uuid,
  action text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_profiles_handle_idx on public.user_profiles (handle);
create index if not exists recipe_requests_user_created_idx on public.recipe_requests (user_id, created_at desc);
create index if not exists recipe_requests_anonymous_created_idx on public.recipe_requests (anonymous_session_id, created_at desc);
create index if not exists voice_note_transcriptions_user_created_idx on public.voice_note_transcriptions (user_id, created_at desc);
create index if not exists generated_recipes_request_idx on public.generated_recipes (recipe_request_id);
create index if not exists generated_recipes_user_created_idx on public.generated_recipes (user_id, created_at desc);
create index if not exists saved_recipes_user_updated_idx on public.saved_recipes (user_id, updated_at desc);
create index if not exists follow_up_requests_user_created_idx on public.follow_up_requests (user_id, created_at desc);
create index if not exists feedback_events_user_created_idx on public.feedback_events (user_id, created_at desc);
create index if not exists feedback_events_type_created_idx on public.feedback_events (event_type, created_at desc);
create index if not exists public_recipes_owner_status_idx on public.public_recipes (owner_user_id, status);
create index if not exists public_recipes_status_published_idx on public.public_recipes (status, published_at desc);
create index if not exists public_recipe_versions_recipe_version_idx on public.public_recipe_versions (public_recipe_id, version_number desc);
create index if not exists recipe_publications_user_created_idx on public.recipe_publications (user_id, created_at desc);
create index if not exists recipe_publications_public_recipe_idx on public.recipe_publications (public_recipe_id);
create index if not exists recipe_likes_recipe_created_idx on public.recipe_likes (public_recipe_id, created_at desc);
create index if not exists recipe_bookmarks_user_created_idx on public.recipe_bookmarks (user_id, created_at desc);
create index if not exists recipe_reports_status_created_idx on public.recipe_reports (status, created_at desc);
create index if not exists recipe_ranking_signals_recipe_type_idx on public.recipe_ranking_signals (public_recipe_id, signal_type, created_at desc);
create index if not exists recipe_ranking_signals_related_idx on public.recipe_ranking_signals (related_public_recipe_id);
create index if not exists audit_events_target_created_idx on public.audit_events (target_type, target_id, created_at desc);
create index if not exists audit_events_actor_created_idx on public.audit_events (actor_user_id, created_at desc);

alter table public.users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.recipe_requests enable row level security;
alter table public.voice_note_transcriptions enable row level security;
alter table public.generated_recipes enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.follow_up_requests enable row level security;
alter table public.feedback_events enable row level security;
alter table public.public_recipes enable row level security;
alter table public.public_recipe_versions enable row level security;
alter table public.recipe_publications enable row level security;
alter table public.recipe_likes enable row level security;
alter table public.recipe_bookmarks enable row level security;
alter table public.recipe_reports enable row level security;
alter table public.recipe_ranking_signals enable row level security;
alter table public.audit_events enable row level security;

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_insert_own on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy user_profiles_select_visible on public.user_profiles
  for select to anon, authenticated
  using (profile_visibility = 'public' or user_id = auth.uid());

create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_settings_manage_own on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy recipe_requests_manage_own on public.recipe_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_session_id is null);

create policy voice_note_transcriptions_manage_own on public.voice_note_transcriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_session_id is null);

create policy generated_recipes_manage_own on public.generated_recipes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_session_id is null);

create policy saved_recipes_manage_own on public.saved_recipes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy follow_up_requests_manage_own on public.follow_up_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_session_id is null);

create policy feedback_events_manage_own on public.feedback_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and anonymous_session_id is null);

create policy public_recipes_select_published on public.public_recipes
  for select to anon, authenticated
  using (status = 'published');

create policy public_recipes_select_owner on public.public_recipes
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy public_recipe_versions_select_published on public.public_recipe_versions
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.public_recipes pr
      where pr.id = public_recipe_versions.public_recipe_id
        and pr.status = 'published'
    )
  );

create policy public_recipe_versions_select_owner on public.public_recipe_versions
  for select to authenticated
  using (
    exists (
      select 1
      from public.public_recipes pr
      where pr.id = public_recipe_versions.public_recipe_id
        and pr.owner_user_id = auth.uid()
    )
  );

create policy recipe_publications_select_own on public.recipe_publications
  for select to authenticated
  using (user_id = auth.uid());

create policy recipe_likes_manage_own on public.recipe_likes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.public_recipes pr
      where pr.id = recipe_likes.public_recipe_id
        and pr.status = 'published'
    )
  );

create policy recipe_bookmarks_manage_own on public.recipe_bookmarks
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.public_recipes pr
      where pr.id = recipe_bookmarks.public_recipe_id
        and pr.status = 'published'
    )
  );

create policy recipe_reports_insert_own on public.recipe_reports
  for insert to authenticated
  with check (
    reporter_user_id = auth.uid()
    and exists (
      select 1
      from public.public_recipes pr
      where pr.id = recipe_reports.public_recipe_id
        and pr.status = 'published'
    )
  );

create policy recipe_reports_select_own on public.recipe_reports
  for select to authenticated
  using (reporter_user_id = auth.uid());

comment on table public.recipe_requests is
  'Private generation requests. These rows may contain raw ingredients, cravings, avoidances, allergy context, and other sensitive constraints.';
comment on table public.voice_note_transcriptions is
  'Private voice-note metadata only. Raw audio storage is intentionally absent from this baseline schema.';
comment on table public.follow_up_requests is
  'Private per-meal follow-up questions and responses. Public recipe publication must not copy raw question text.';
comment on table public.public_recipe_versions is
  'Sanitized immutable public recipe content only. This table intentionally has no raw prompt, transcript, private note, anonymous session, or provider error columns.';
comment on table public.recipe_publications is
  'Controlled bridge from private saved recipe to sanitized public recipe version. Publication must run the documented sanitizer contract.';
comment on table public.recipe_ranking_signals is
  'Derived public/community ranking signals only. Do not store private requests, settings, transcripts, follow-up questions, or personal constraints here.';
comment on table public.audit_events is
  'Operational audit trail for publication, moderation, account deletion, export, and migration events. Browser roles do not receive policies for this table in the baseline.';
