# REMOTE_LEADERBOARD.md — optional global leaderboard (Phase 7)

Nibble's leaderboard is **local-first**: everything works fully offline through
`createLocalAdapter()` (IndexedDB). The remote leaderboard described here is an
**optional, disabled-by-default** decorator on top of that — see
`src/data/remote.ts` and `src/data/remote.config.ts`. With no environment
variables set, the game runs exactly as it did before this feature existed.

This doc covers standing up the Supabase side and what its validation can and
cannot guarantee.

## 1. Create a Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a new
   project.
2. From **Project Settings → API**, note down:
   - **Project URL** (e.g. `https://xyz.supabase.co`)
   - **anon (public) key** — NOT the `service_role` key. The anon key is safe
     to ship in client code because it only carries whatever access Row Level
     Security (RLS, below) explicitly grants it.

## 2. Create the `scores` table

Run this in the Supabase SQL editor (Project → SQL Editor → New query):

```sql
create table if not exists public.scores (
  id           bigint generated always as identity primary key,
  mode_id      text not null,
  name         text not null check (char_length(name) between 1 and 12),
  score        integer not null check (score >= 0 and score <= 100000),
  achieved_at  timestamptz not null default now()
);

create index if not exists scores_mode_id_score_idx
  on public.scores (mode_id, score desc);
```

Notes on the shape, matching `LeaderboardEntry` in `src/data/adapter.ts`:

- `mode_id` / `name` / `score` / `achieved_at` are the snake_case wire form;
  `src/data/remote.ts` converts to/from the camelCase `LeaderboardEntry` the
  rest of the app uses (`modeId`, `name`, `score`, `achievedAt`).
- `name` is capped at 12 characters, matching `MAX_NAME_LENGTH` in
  `src/ui/shell.ts`. **These two must move together** — if the client cap is
  raised past what this `check` allows, a longer name POSTs successfully to
  `local` but is rejected server-side (row-shape violation), and the remote
  submit silently falls back to a local-only save (see the fallback note in
  `src/data/remote.ts`). The client trims to `MAX_NAME_LENGTH` and substitutes
  `'Player'` for an empty name, so `between 1 and 12` is always satisfiable.
- `score` is bounded `[0, 100000]` as a sanity ceiling, not a real anti-cheat
  measure — see [Section 4](#4-what-this-cannot-stop) below.

### Migrating an existing `scores` table (name length 3 → 12)

If you already ran the older schema (which had `check (char_length(name) <=
3)`), run this once to widen the name limit without recreating the table or
losing rows:

```sql
alter table public.scores
  drop constraint if exists scores_name_check;

alter table public.scores
  add constraint scores_name_check
  check (char_length(name) between 1 and 12);
```

Postgres auto-names a column `check` constraint `<table>_<column>_check`, so
the original constraint is `scores_name_check`; the `drop ... if exists` makes
this safe to run even if it was named differently (it just becomes a no-op and
the `add` still applies the new rule). Existing 3-char rows remain valid.

## 3. Enable Row Level Security (RLS) with anon policies

By default a new Supabase table has RLS enabled with **no** policies, which
means the anon key can do nothing — the safe starting point. Add exactly the
two policies this feature needs: public read, and insert-only write (no anon
update/delete).

```sql
alter table public.scores enable row level security;

-- Anyone (including the anon key) can read leaderboard rows.
create policy "scores are publicly readable"
  on public.scores
  for select
  to anon
  using (true);

-- Anyone (including the anon key) can submit a new score, but never
-- update or delete existing rows.
create policy "anyone can submit a score"
  on public.scores
  for insert
  to anon
  with check (true);
```

Do **not** add `update`/`delete` policies for the `anon` role — that would let
any client rewrite or erase leaderboard history.

## 4. What this cannot stop

The `check` constraints and RLS policies above are real, enforced server-side
validation — they are not decorative. But they only bound the *shape* of a
score, not whether the player actually *earned* it. A client that plays no
game at all can still POST a request that looks like:

```json
{ "mode_id": "classic", "name": "AAA", "score": 87340, "achieved_at": "2026-07-02T12:00:00Z" }
```

and every constraint above happily accepts it, because 87340 is a
plausible-looking score within range. `submitScore` on the client
(`src/data/remote.ts`) has a doc comment pointing back here for exactly this
reason: **a client-submitted score is untrusted input**, full stop, and no
purely client-side or purely-CHECK-constraint defense changes that.

The actual fix is out of scope for this phase: **replay or tick-trace
validation**. The idea is the client submits (or the server independently
reconstructs) the sequence of ticks/inputs that produced the score, and a
server-side re-run of the same deterministic engine (`src/engine/`, already
seeded-RNG + injected-time deterministic by design — see `CLAUDE.md`) checks
that replaying those inputs actually yields the claimed score before it's
accepted. That requires a server-side runner for the engine and a wire format
for tick traces, neither of which exists yet. Until then, treat the global
leaderboard as "best effort / for fun," not a competitive-integrity guarantee.

## 5. Rate limiting

Nothing above rate-limits submissions — a script could hammer the insert
policy with garbage rows. Two options, in increasing order of effort:

- **Supabase Edge Function**: put a small Edge Function in front of writes
  instead of hitting PostgREST directly, and rate-limit by IP or a
  per-session token inside the function. This is also where you'd eventually
  add the replay-validation check from Section 4.
- **Postgres trigger**: a `before insert` trigger on `public.scores` that
  counts recent rows (e.g. by matching `name` or a client-supplied session
  id) within a time window and raises an exception past some threshold.
  Simpler to wire up, cruder to tune.

Neither is implemented today; this section exists so the next person picking
this up doesn't have to rediscover the gap.

## 6. Client environment variables

Three Vite env vars control the remote adapter, all read in
`src/data/remote.config.ts`:

| Variable | Required | Meaning |
|---|---|---|
| `VITE_LEADERBOARD_URL` | yes, to enable | Supabase project URL, e.g. `https://xyz.supabase.co` |
| `VITE_LEADERBOARD_ANON_KEY` | yes, to enable | Supabase anon (public) API key — never the service key |
| `VITE_LEADERBOARD_TABLE` | no | Table name; defaults to `scores` if unset |

The remote leaderboard is enabled **only** when both `VITE_LEADERBOARD_URL`
and `VITE_LEADERBOARD_ANON_KEY` are set and non-empty; otherwise
`REMOTE_LEADERBOARD.enabled` is `false` and the app runs local-only exactly as
before.

Put these in a `.env.local` file at the repo root:

```
VITE_LEADERBOARD_URL=https://xyz.supabase.co
VITE_LEADERBOARD_ANON_KEY=your-anon-key-here
VITE_LEADERBOARD_TABLE=scores
```

`.env.local` is already covered by the repo's `.gitignore` via the `*.local`
pattern — confirmed present in `.gitignore` at the repo root — so this file is
never committed. Do not put real keys in any tracked `.env` file (there isn't
one today; keep it that way).

## 7. What stays unchanged if you skip all of this

If none of the above is done, `REMOTE_LEADERBOARD.enabled` is `false`,
`createAdapter()` (in `src/data/index.ts`) returns the plain local adapter,
and the game behaves exactly as it did before Phase 7 — fully offline,
fully local. Nothing in `src/engine/`, `src/render/`, `src/themes/`,
`src/levels/`, or `src/ui/` changes because of this feature; it lives
entirely behind the existing `PersistenceAdapter` interface in `src/data/`.
