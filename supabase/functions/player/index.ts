// Supabase Edge Function: `player`
//
// The gatekeeper for player accounts (cross-device progress). It is the ONLY
// thing allowed to touch public.players / public.player_scores — those tables
// have RLS enabled with no policies, so the anon key can't read/write them
// directly; this function uses the service_role key (which bypasses RLS) and
// validates every request.
//
// Contract (matches src/data/player-sync.ts — one action-dispatched JSON POST):
//   { action:'create', name }                                 -> 201 { code, name, coins:0, unlocks:[] }
//   { action:'get', code }                                    -> 200 { code, name, coins, unlocks, scores[] } | 404
//   { action:'sync', code, coins, unlocks }                   -> 200 { coins, unlocks }
//   { action:'submitScore', code, modeId, score, achievedAt } -> 200 { ok:true }
//
// Deploy from the Supabase dashboard (Edge Functions → Deploy a new function)
// or via `supabase functions deploy player`. No extra secrets to set: SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY are injected automatically. See docs/PLAYER_ACCOUNTS.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The RLS-bypassing key. We read a custom `SERVICE_ROLE_KEY` secret FIRST
// because Supabase's auto-injected `SUPABASE_SERVICE_ROLE_KEY` may be a newer
// `sb_secret_...` key that maps to a limited role and does NOT bypass RLS
// (symptom: "permission denied for table players"). The value must be the
// legacy `service_role` JWT (a long token starting with `eyJ`) from
// Project Settings → API → Project API keys → service_role.
const SERVICE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// IMPORTANT: pin the Authorization header to the service_role key. Without
// this, supabase-js forwards the INCOMING request's Authorization (the game's
// anon key) to PostgREST, so queries run as the anon role and RLS denies them.
// Setting it here — and disabling session persistence/refresh — guarantees
// every query bypasses RLS as service_role regardless of what the caller sent.
const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${SERVICE_KEY}` } },
})

// CORS: the game is served from a different origin (GitHub Pages), so the
// browser sends a preflight OPTIONS and requires these headers on every reply.
const CORS = {
  'Access-Control-Allow-Origin': '*', // tighten to your Pages origin if you prefer
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

// Must match the code alphabet in src/data/identity.ts (no 0/O/1/I/L).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
// Must match the shop item ids in src/data/economy.config.ts. Unknown ids in a
// sync are dropped so a tampered client can't invent unlocks.
const KNOWN_UNLOCKS = new Set([
  'theme:mono-plus',
  'theme:first-color',
  'theme:colored-pixel',
  'theme:detailed-pixel',
  'theme:cartoon',
  'theme:neon',
])

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return `NIBBLE-${s.slice(0, 4)}-${s.slice(4, 8)}`
}

const clampCoins = (n: unknown) =>
  Math.max(0, Math.min(1_000_000, Math.floor(Number(n) || 0)))
const clampScore = (n: unknown) =>
  Math.max(0, Math.min(100_000, Math.floor(Number(n) || 0)))
const cleanUnlocks = (u: unknown): string[] =>
  Array.isArray(u) ? [...new Set(u.filter((x) => KNOWN_UNLOCKS.has(x)))] : []
const cleanName = (n: unknown) => String(n ?? '').trim().slice(0, 12) || 'Player'

Deno.serve(async (req) => {
  // Preflight.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { action } = payload

  try {
    if (action === 'create') {
      const name = cleanName(payload.name)
      // Retry on the (astronomically unlikely) primary-key collision.
      for (let i = 0; i < 5; i++) {
        const code = newCode()
        const { error } = await db.from('players').insert({ code, name })
        if (!error) return json({ code, name, coins: 0, unlocks: [] }, 201)
        if (error.code !== '23505') return json({ error: error.message }, 500) // 23505 = unique_violation
      }
      return json({ error: 'could not allocate a unique code' }, 500)
    }

    if (action === 'get') {
      const code = String(payload.code ?? '')
      const { data: p } = await db
        .from('players')
        .select('code,name,coins,unlocks')
        .eq('code', code)
        .maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      const { data: rows } = await db
        .from('player_scores')
        .select('mode_id,score,achieved_at')
        .eq('code', code)
        .order('score', { ascending: false })
        .limit(50)
      const scores = (rows ?? []).map((r) => ({
        modeId: r.mode_id,
        score: r.score,
        achievedAt: Date.parse(r.achieved_at),
      }))
      return json({ code: p.code, name: p.name, coins: p.coins, unlocks: p.unlocks, scores })
    }

    if (action === 'sync') {
      const code = String(payload.code ?? '')
      const { data: p } = await db
        .from('players')
        .select('coins,unlocks')
        .eq('code', code)
        .maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      // Ratchet up only: coins can never be lowered, unlocks only accumulate.
      const coins = Math.max(p.coins, clampCoins(payload.coins))
      const unlocks = [...new Set([...(p.unlocks ?? []), ...cleanUnlocks(payload.unlocks)])]
      const { error } = await db
        .from('players')
        .update({ coins, unlocks, updated_at: new Date().toISOString() })
        .eq('code', code)
      if (error) return json({ error: error.message }, 500)
      return json({ coins, unlocks })
    }

    if (action === 'submitScore') {
      const code = String(payload.code ?? '')
      const { data: p } = await db.from('players').select('code').eq('code', code).maybeSingle()
      if (!p) return json({ error: 'not found' }, 404)
      const { error } = await db.from('player_scores').insert({
        code,
        mode_id: String(payload.modeId ?? ''),
        score: clampScore(payload.score),
        achieved_at: typeof payload.achievedAt === 'string' ? payload.achievedAt : new Date().toISOString(),
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
