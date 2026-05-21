import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260521235850_initial_data_schema.sql", import.meta.url);
const docUrl = new URL("../docs/database-schema-baseline.md", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

const requiredTables = [
  "users",
  "user_profiles",
  "user_settings",
  "recipe_requests",
  "voice_note_transcriptions",
  "generated_recipes",
  "saved_recipes",
  "follow_up_requests",
  "feedback_events",
  "public_recipes",
  "public_recipe_versions",
  "recipe_publications",
  "recipe_likes",
  "recipe_bookmarks",
  "recipe_reports",
  "recipe_ranking_signals",
  "audit_events",
];

function tableDefinition(sql, tableName) {
  const pattern = new RegExp(
    `create table if not exists public\\.${tableName} \\([\\s\\S]*?\\n\\);`,
    "i",
  );
  const match = sql.match(pattern);
  assert.ok(match, `missing ${tableName} table`);
  return match[0];
}

test("initial Supabase migration defines the required Cookooi entities", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const doc = await readFile(docUrl, "utf8");

  for (const tableName of requiredTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${tableName}\\b`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${tableName} enable row level security;`, "i"));
    assert.match(doc, new RegExp(`\\\`${tableName}\\\``));
  }
});

test("private tables include ownership, schema versions, foreign keys, and indexes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const privateTables = [
    "user_settings",
    "recipe_requests",
    "voice_note_transcriptions",
    "generated_recipes",
    "saved_recipes",
    "follow_up_requests",
    "feedback_events",
  ];

  for (const tableName of privateTables) {
    const definition = tableDefinition(sql, tableName);
    assert.match(definition, /schema_version integer not null default 1/i, `${tableName} needs schema_version`);
  }

  assert.match(tableDefinition(sql, "recipe_requests"), /user_id uuid references public\.users\(id\)/i);
  assert.match(tableDefinition(sql, "generated_recipes"), /recipe_request_id uuid not null references public\.recipe_requests\(id\)/i);
  assert.match(tableDefinition(sql, "saved_recipes"), /generated_recipe_id uuid references public\.generated_recipes\(id\)/i);
  assert.match(tableDefinition(sql, "follow_up_requests"), /saved_recipe_id uuid references public\.saved_recipes\(id\)/i);
  assert.match(sql, /create index if not exists recipe_requests_user_created_idx/i);
  assert.match(sql, /create index if not exists saved_recipes_user_updated_idx/i);
  assert.match(sql, /create policy saved_recipes_manage_own/i);
});

test("community schema enforces public interactions and one-like uniqueness", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(tableDefinition(sql, "recipe_likes"), /unique \(public_recipe_id, user_id\)/i);
  assert.match(tableDefinition(sql, "recipe_bookmarks"), /unique \(public_recipe_id, user_id\)/i);
  assert.match(tableDefinition(sql, "public_recipe_versions"), /unique \(public_recipe_id, version_number\)/i);
  assert.match(sql, /create index if not exists public_recipes_status_published_idx/i);
  assert.match(sql, /create index if not exists recipe_reports_status_created_idx/i);
  assert.match(sql, /create index if not exists recipe_ranking_signals_recipe_type_idx/i);
  assert.match(sql, /create policy recipe_likes_manage_own/i);
  assert.match(sql, /pr\.status = 'published'/i);
});

test("public recipe tables exclude private prompt, transcript, and note fields", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const doc = await readFile(docUrl, "utf8");
  const publicRecipe = tableDefinition(sql, "public_recipes");
  const publicVersion = tableDefinition(sql, "public_recipe_versions");
  const publicSurface = `${publicRecipe}\n${publicVersion}`;

  assert.doesNotMatch(publicSurface, /\b(raw_|transcript|prompt|private_notes|anonymous_session_id|provider_error|follow_up_question)\b/i);
  assert.match(publicVersion, /publication_sanitizer_version/i);
  assert.match(doc, /copy-and-sanitize workflow/i);
  assert.match(doc, /does not include columns for raw prompts/i);
});

test("database baseline is documented without requiring runtime database configuration", async () => {
  const readme = await readFile(readmeUrl, "utf8");
  const doc = await readFile(docUrl, "utf8");
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(readme, /database-schema-baseline\.md/);
  assert.match(readme, /supabase\/migrations\/20260521235850_initial_data_schema\.sql/);
  assert.match(doc, /No production database, Supabase project, or account feature flag is required/i);
  assert.match(doc, /COOKOOI_ACCOUNTS_ENABLED=false/);
  assert.doesNotMatch(`${readme}\n${doc}\n${sql}`, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(`${readme}\n${doc}\n${sql}`, /postgres(?:ql)?:\/\/[^`\s]+:[^`\s]+@/i);
  assert.doesNotMatch(`${doc}\n${sql}`, /\bfridge\b/i);
});
