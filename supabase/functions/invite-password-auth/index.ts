import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const KICKPOT_ORIGIN = 'https://kickpot-web-production.up.railway.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': KICKPOT_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

function cleanEmail(value: unknown) { return String(value || '').trim().toLowerCase() }
function cleanInvite(value: unknown) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) }
function cleanDisplayName(value: unknown, email: string) {
  const fallback = (email.split('@')[0] || 'Player').trim()
  const name = String(value || fallback).trim().replace(/\s+/g, ' ')
  return (name || fallback).slice(0, 40)
}
function validEmail(email: string) { return email.length >= 5 && email.length <= 254 && /^\S+@\S+\.\S+$/.test(email) }
function isPin(secret: unknown) { return typeof secret === 'string' && /^\d{6}$/.test(secret) }
function isLegacyPassword(secret: unknown) { return typeof secret === 'string' && secret.length >= 10 && secret.length <= 128 }
function validLoginSecret(secret: unknown) { return isPin(secret) || isLegacyPassword(secret) }
function safeMessage(error: unknown) {
  const message = String((error as { message?: string })?.message || '')
  if (/invalid login credentials/i.test(message)) return 'Email or PIN is incorrect.'
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a moment and try again.'
  return 'KickPot could not complete that sign-in. Please try again.'
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json(503, { error: 'Authentication service is not configured.' })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json(400, { error: 'Invalid request.' }) }

  const action = String(body.action || '')
  const email = cleanEmail(body.email)
  const password = body.password
  const inviteCode = cleanInvite(body.inviteCode)
  const displayName = cleanDisplayName(body.displayName, email)

  if (!validEmail(email)) return json(400, { error: 'Enter a valid email address.' })
  if (action === 'register' && !isPin(password)) return json(400, { error: 'Choose a 6-digit PIN.' })
  if (action === 'login' && !validLoginSecret(password)) return json(400, { error: 'Enter your 6-digit PIN. Older passwords still work from the old-password option.' })
  if (action === 'register' && (displayName.length < 1 || displayName.length > 40)) return json(400, { error: 'Enter a display name.' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  const identifierHash = await sha256(email)
  async function checkRateLimit() {
    const { data } = await admin.from('auth_login_limits').select('*').eq('identifier_hash', identifierHash).maybeSingle()
    if (!data) return { blocked: false }
    const now = Date.now()
    const blockedUntil = data.blocked_until ? new Date(data.blocked_until).getTime() : 0
    if (blockedUntil > now) return { blocked: true, retrySeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)) }
    const windowStart = new Date(data.window_started_at).getTime()
    if (!Number.isFinite(windowStart) || now - windowStart > 15 * 60 * 1000) {
      await admin.from('auth_login_limits').upsert({ identifier_hash: identifierHash, attempts: 0, window_started_at: new Date().toISOString(), blocked_until: null, updated_at: new Date().toISOString() })
    }
    return { blocked: false }
  }
  async function recordFailure() {
    const { data } = await admin.from('auth_login_limits').select('*').eq('identifier_hash', identifierHash).maybeSingle()
    const now = Date.now()
    const windowStart = data?.window_started_at ? new Date(data.window_started_at).getTime() : 0
    const withinWindow = Number.isFinite(windowStart) && now - windowStart <= 15 * 60 * 1000
    const attempts = withinWindow ? Number(data?.attempts || 0) + 1 : 1
    const blockedUntil = attempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null
    await admin.from('auth_login_limits').upsert({ identifier_hash: identifierHash, attempts, window_started_at: withinWindow ? data.window_started_at : new Date(now).toISOString(), blocked_until: blockedUntil, updated_at: new Date(now).toISOString() })
    return { attempts, blockedUntil }
  }
  async function clearFailures() {
    await admin.from('auth_login_limits').delete().eq('identifier_hash', identifierHash)
  }

  async function groupForInvite(code: string) {
    if (!code) return null
    const { data } = await admin.from('groups').select('id,name').eq('join_code', code).maybeSingle()
    return data || null
  }
  async function aliasFor(loginEmail: string) {
    const { data } = await admin.from('login_aliases').select('user_id,auth_email').ilike('login_email', loginEmail).maybeSingle()
    return data || null
  }
  async function joinWithSession(accessToken: string, code: string) {
    if (!code) return { ok: true, group: null }
    const group = await groupForInvite(code)
    if (!group) return { ok: false, error: 'That invite link is no longer valid.' }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await userClient.rpc('join_group', { p_join_code: code })
    if (error && !/already/i.test(error.message || '')) return { ok: false, error: 'Could not join that group.' }
    return { ok: true, group: data || group }
  }
  async function realEmailAccountExists(loginEmail: string) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) return false
    return (data.users || []).some(user => String(user.email || '').toLowerCase() === loginEmail)
  }

  if (action === 'login') {
    const limit = await checkRateLimit()
    if (limit.blocked) return json(429, { error: `Too many incorrect attempts. Try again in about ${Math.ceil(Number(limit.retrySeconds || 60) / 60)} minute(s).`, code: 'pin_locked' })

    const alias = await aliasFor(email)
    const authEmail = alias?.auth_email || email
    const { data, error } = await authClient.auth.signInWithPassword({ email: authEmail, password: String(password) })
    if (error || !data.session) {
      const failure = await recordFailure()
      if (failure.blockedUntil) return json(429, { error: 'Too many incorrect attempts. PIN login is locked for 15 minutes.', code: 'pin_locked' })
      const existing = !alias && await realEmailAccountExists(email)
      return json(401, {
        error: existing ? 'This account does not have a PIN yet. If you are signed in on another device, open Account and choose one there.' : safeMessage(error),
        code: existing ? 'pin_not_set' : 'invalid_login',
      })
    }
    await clearFailures()
    const joined = inviteCode ? await joinWithSession(data.session.access_token, inviteCode) : { ok: true, group: null }
    if (!joined.ok) return json(400, { error: joined.error || 'Could not join that group.' })
    return json(200, { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresIn: data.session.expires_in, joinedGroup: joined.group })
  }

  if (action === 'register') {
    const group = inviteCode ? await groupForInvite(inviteCode) : null
    if (inviteCode && !group) return json(400, { error: 'That invite link is no longer valid.' })
    if (await aliasFor(email)) return json(409, { error: 'An account already exists for this email. Log in instead.', code: 'account_exists' })
    if (await realEmailAccountExists(email)) return json(409, { error: 'This email already has a KickPot account. Log in, or choose a PIN from Account if you originally used a magic link.', code: 'existing_magic_account' })

    const local = (email.split('@')[0] || 'player').replace(/[^a-z0-9._-]/gi, '').slice(0, 24) || 'player'
    const random = crypto.randomUUID().replace(/-/g, '').slice(0, 18)
    const authEmail = `${local}.${random}@users.kickpot.invalid`
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: authEmail, password: String(password), email_confirm: true, user_metadata: { login_email: email, kickpot_login_alias: true, kickpot_pin: true } })
    if (createError || !created.user) return json(400, { error: safeMessage(createError) })

    const userId = created.user.id
    const cleanup = async () => {
      await admin.from('login_aliases').delete().eq('user_id', userId)
      await admin.auth.admin.deleteUser(userId).catch(() => {})
    }
    const { error: aliasError } = await admin.from('login_aliases').insert({ user_id: userId, login_email: email, auth_email: authEmail })
    if (aliasError) { await cleanup(); return json(409, { error: 'An account already exists for this email. Log in instead.', code: 'account_exists' }) }
    const { error: profileError } = await admin.from('profiles').upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
    if (profileError) { await cleanup(); return json(400, { error: 'Could not create your KickPot profile. Please try again.' }) }

    const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({ email: authEmail, password: String(password) })
    if (signInError || !signedIn.session) { await cleanup(); return json(500, { error: 'Your account could not be started. Please try again.' }) }
    const joined = inviteCode ? await joinWithSession(signedIn.session.access_token, inviteCode) : { ok: true, group: null }
    if (!joined.ok) { await cleanup(); return json(400, { error: joined.error || 'Could not join that group.' }) }

    await clearFailures()
    return json(201, { accessToken: signedIn.session.access_token, refreshToken: signedIn.session.refresh_token, expiresIn: signedIn.session.expires_in, joinedGroup: joined.group || group || null })
  }

  return json(400, { error: 'Unknown authentication action.' })
})
