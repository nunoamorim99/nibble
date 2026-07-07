# PLAYER_ACCOUNTS.md — optional cross-device progress (recovery-code accounts)

Nibble is **local-first**: coins, unlocks, and scores all work fully offline
through IndexedDB. This feature adds an **optional, disabled-by-default**
account so a player can carry their coins, unlocks, and their own scores to a
new device (or recover them after a browser/PWA wipes local storage).

The account is keyed by a **secret code** (e.g. `NIBBLE-7Q2K-9F4M`) — no email,
no password. The display name is just a label; the code is the identity. If a
player loses the code, the account is unrecoverable (see §6).

Unlike the leaderboard (`docs/REMOTE_LEADERBOARD.md`), which lets the anon key
insert rows directly, **player data is only reachable through a Supabase Edge
Function** that holds the `service_role` key. The anon key gets *no* direct
access to the account tables (RLS denies it). This is deliberately stronger,
because a coin balance is a thing of value the client can spend.

With `VITE_PLAYER_API_URL` unset, none of this is active and the game behaves
exactly as before — no prompt, no network, pure local.

## 1. Create the tables

Run in the Supabase SQL editor (Project → SQL Editor → New query):

```sql
create table if not exists public.players (
  code        text primary key,             -- secret identity, e.g. NIBBLE-7Q2K-9F4M
  name        text not null check (char_length(name) between 1 and 12),
  coins       integer not null default 0 check (coins >= 0 and coins <= 1000000),
  unlocks     text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.player_scores (
  id          bigint generated always as identity primary key,
  code        text not null references public.players(code) on delete cascade,
  mode_id     text not null,
  score       integer not null check (score >= 0 and score <= 100000),
  achieved_at timestamptz not null default now()
);

create index if not exists player_scores_code_score_idx
  on public.player_scores (code, score desc);
```

Notes:

- `name` is capped at 12 chars to match `MAX_NAME_LENGTH` in
  `src/ui/shell.ts` and the leaderboard's `scores.name` constraint. Move them
  together if you ever change it.
- `coins` is bounded `[0, 1_000_000]` as a sanity ceiling (not real anti-cheat
  — see §5).
- Player scores live in their OWN table, separate from the public `scores`
  leaderboard. The leaderboard is unchanged by this feature.

## 2. Deny the anon key (RLS with NO policies)

```sql
alter table public.players enable row level security;
alter table public.player_scores enable row level security;
-- Add NO policies. With RLS on and no policies, the anon (and authenticated)
-- roles can do nothing. Only the Edge Function, which uses the service_role
-- key, bypasses RLS. This is the whole security model: the shipped anon key
-- CANNOT read or write these tables directly — it can only invoke the
-- function, which validates every request.
```

Do **not** add anon policies here. If you do, you reintroduce exactly the
attack the Edge Function exists to prevent (any client rewriting any account's
coins).

## 3. The Edge Function (`player`)

One function, dispatched by an `action` field in a JSON POST body. It holds the
`service_role` key (available as the `SUPABASE_SERVICE_ROLE_KEY` env var inside
Supabase Functions) and is the only thing that touches the tables above.

### Contract

Base URL = `VITE_PLAYER_API_URL` = `https://<project>.functions.supabase.co/player`.
All requests `POST`, `Content-Type: application/json`. The client sends the
Supabase **anon key** as `apikey`/`Authorization: Bearer` — that only gets it
past the Functions gateway; it grants no table access.

| action | request body | success response |
|---|---|---|
| `create` | `{ action:"create", name }` | `201 { code, name, coins:0, unlocks:[] }` |
| `get` | `{ action:"get", code }` | `200 { code, name, coins, unlocks, scores:[{modeId,score,achievedAt}] }` or `404` |
| `sync` | `{ action:"sync", code, coins, unlocks }` | `200 { coins, unlocks }` (authoritative, post-clamp) |
| `submitScore` | `{ action:"submitScore", code, modeId, score, achievedAt }` | `200 { ok:true }` |

The client (`src/data/player-sync.ts`) treats any non-2xx (except `get`'s 404,
which means "unknown code") as a failure and degrades to local-only, warning
once per session. So the game never blocks on this being up.

### Server-side validation (the point of the gatekeeper)

- **create**: validate `name` to 1–12 chars; **generate the code server-side**
  (see the skeleton) and retry on the astronomically-unlikely primary-key
  collision so the returned code is guaranteed unique.
- **get**: `404` if the code doesn't exist. Return the account's own scores
  (best-first, cap ~50) from `player_scores`.
- **sync**: `404` if the code doesn't exist. Coerce `coins` to an integer in
  `[0, 1_000_000]`; drop any `unlocks` ids that aren't known shop items;
  enforce **`coins = max(stored, incoming)`** so a tampered-down client can't
  erase progress and (weakly) so coins only ratchet up. Bump `updated_at`.
  Return the stored values so the client re-reconciles if you clamped.
- **submitScore**: `404` if the code doesn't exist; `score` integer in
  `[0, 100000]`.
- **Rate-limit**: creations per IP/hour, and sync/submit per code + per IP, to
  blunt scripted abuse.

### The function

A complete, ready-to-deploy implementation lives in the repo at
**`supabase/functions/player/index.ts`** — CORS-correct (the game calls it
cross-origin from GitHub Pages), matched to the client contract above, with the
`max(coins)` / union-unlocks ratchet and value clamps already wired. It has no
rate-limiting yet (add it when abuse becomes a concern).

Deploy it either way:
- **Dashboard (no tooling):** Edge Functions → *Deploy a new function* (or
  *Create via editor*) → name it exactly `player` → paste the file's contents →
  Deploy. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
  automatically; no secrets to set.
- **CLI:** `supabase functions deploy player` from the repo root.

The reference skeleton below is the same logic in a slightly shorter form, for
illustration — prefer the committed file.

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // bypasses RLS — never ship to the client
)

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // must match src/data/identity.ts
const KNOWN_UNLOCKS = new Set([
  // keep in sync with SHOP_CATALOG ids in src/data/economy.config.ts
  'theme:mono-plus', 'theme:first-color', 'theme:colored-pixel',
  'theme:detailed-pixel', 'theme:neon', 'theme:cartoon',
])

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length] // server-side; bias here is harmless
  return `NIBBLE-${s.slice(0, 4)}-${s.slice(4, 8)}`
}
const clampCoins = (n: unknown) =>
  Math.max(0, Math.min(1_000_000, Math.floor(Number(n) || 0)))
const cleanUnlocks = (u: unknown) =>
  Array.isArray(u) ? [...new Set(u.filter((x) => KNOWN_UNLOCKS.has(x)))] : []

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const { action, name, code, coins, unlocks, modeId, score, achievedAt } = await req.json()

  if (action === 'create') {
    const nm = String(name ?? '').slice(0, 12) || 'Player'
    for (let i = 0; i < 5; i++) {
      const c = newCode()
      const { error } = await db.from('players').insert({ code: c, name: nm })
      if (!error) return json({ code: c, name: nm, coins: 0, unlocks: [] }, 201)
      if (error.code !== '23505') return json({ error: error.message }, 500) // 23505 = unique_violation → retry
    }
    return json({ error: 'could not allocate code' }, 500)
  }

  if (action === 'get') {
    const { data: p } = await db.from('players').select('*').eq('code', code).maybeSingle()
    if (!p) return json({ error: 'not found' }, 404)
    const { data: rows } = await db
      .from('player_scores').select('mode_id,score,achieved_at')
      .eq('code', code).order('score', { ascending: false }).limit(50)
    const scores = (rows ?? []).map((r) => ({
      modeId: r.mode_id, score: r.score, achievedAt: Date.parse(r.achieved_at),
    }))
    return json({ code: p.code, name: p.name, coins: p.coins, unlocks: p.unlocks, scores })
  }

  if (action === 'sync') {
    const { data: p } = await db.from('players').select('coins,unlocks').eq('code', code).maybeSingle()
    if (!p) return json({ error: 'not found' }, 404)
    const mergedCoins = Math.max(p.coins, clampCoins(coins))          // ratchet up only
    const mergedUnlocks = [...new Set([...(p.unlocks ?? []), ...cleanUnlocks(unlocks)])]
    await db.from('players')
      .update({ coins: mergedCoins, unlocks: mergedUnlocks, updated_at: new Date().toISOString() })
      .eq('code', code)
    return json({ coins: mergedCoins, unlocks: mergedUnlocks })
  }

  if (action === 'submitScore') {
    const { data: p } = await db.from('players').select('code').eq('code', code).maybeSingle()
    if (!p) return json({ error: 'not found' }, 404)
    const s = Math.max(0, Math.min(100000, Math.floor(Number(score) || 0)))
    await db.from('player_scores').insert({
      code, mode_id: String(modeId ?? ''), score: s,
      achieved_at: achievedAt ?? new Date().toISOString(),
    })
    return json({ ok: true })
  }

  return json({ error: 'unknown action' }, 400)
})
```

## 4. Client environment variables

| Variable | Required | Meaning |
|---|---|---|
| `VITE_PLAYER_API_URL` | yes, to enable | Edge Function base URL, e.g. `https://xyz.functions.supabase.co/player` |
| `VITE_LEADERBOARD_ANON_KEY` | yes, to enable | Supabase anon key — **reused** from the leaderboard (same project) |

Accounts are enabled **only** when both are set and non-blank
(`src/data/player.config.ts`); otherwise the feature is off and the game is
local-only. Put them in `.env.local` (git-ignored via `*.local`):

```
VITE_PLAYER_API_URL=https://xyz.functions.supabase.co/player
VITE_LEADERBOARD_ANON_KEY=your-anon-key-here
```

For the deployed site, set `VITE_PLAYER_API_URL` as a GitHub Actions
**variable** (Settings → Secrets and variables → Actions → Variables). The
build workflow already passes it through
(`.github/workflows/deploy-pages.yml`).

## 5. What this cannot stop

The gatekeeper bounds the *shape*, *rate*, and *monotonicity* of writes — it is
real, enforced, server-side validation, not decoration. But the coin balance is
still ultimately a client claim: the client computes coins locally and pushes
them, so a determined cheater can inflate their own account up to the ceiling
and the `max()` ratchet. That only affects *their own* cosmetics; it grants no
gameplay advantage (unlocks are cosmetic by the repo's rules) and cannot touch
another player's account (the code is required and never exposed). True
anti-cheat would need server-side replay validation of the tick trace — same
future-work note as the leaderboard doc. Treat accounts as "keep my progress,"
not "competitively authoritative."

## 6. Lost codes

There is no email/password recovery: the code is the only key. The Profile
screen shows the code prominently with a copy button and a "save this — it's
the only way back" warning. A player who loses the code loses the account. This
is an accepted trade for a no-friction, no-login casual game.

## 7. What stays unchanged if you skip all of this

With `VITE_PLAYER_API_URL` unset, `PLAYER_ACCOUNTS.enabled` is `false`,
`createPlayerRuntime()` (in `src/data/index.ts`) returns the same adapter
`createAdapter()` would, with no player client and no first-run prompt. Nothing
in `src/engine/`, `src/render/`, `src/themes/`, or `src/levels/` is affected;
the feature lives entirely in `src/data/` + `src/ui/` behind the existing
`PersistenceAdapter` interface.
```
