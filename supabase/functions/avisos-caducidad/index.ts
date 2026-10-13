// Avisos de caducidad: revisa la despensa de cada usuario con avisos activados y le manda una
// notificación si algo caduca hoy, mañana o pasado mañana. Una vez al día (pg_cron, 9:00 hora de CDMX).
//
// - Llamada diaria (cron): body {}  → revisa a todos; no repite el aviso el mismo día.
// - Prueba desde la app:   body { test: true } con la sesión del usuario → solo a ese usuario, siempre.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = 'BEkQU75Xo7Axqbg8ozVVzGYJ8qUlNAGgp4QSTPg3D5iUADUp44HJGB6qBRjNYsTei8iTrct4zvdDJF7LAOcuFrk'
const APP_URL = 'https://matthzr17.github.io/planificador-alimenticio/'
const TZ = 'America/Mexico_City'
const DAYS_AHEAD = 2

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function when(expires: string, today: string) {
  if (expires < today) return 'ya caducó'
  if (expires === today) return 'hoy'
  if (expires === addDays(today, 1)) return 'mañana'
  return 'pasado mañana'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: privateKey, error: keyError } = await admin.rpc('get_vapid_private_key')
  if (keyError || !privateKey) return json({ error: 'Falta la llave VAPID' }, 500)
  webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, privateKey as string)

  const body = await req.json().catch(() => ({}))
  const test = body?.test === true
  let onlyUser: string | null = null
  if (test) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data } = await admin.auth.getUser(token)
    if (!data.user) return json({ error: 'Sin sesión' }, 401)
    onlyUser = data.user.id
  }

  const today = todayIn(TZ)
  let q = admin.from('push_subscriptions').select('*')
  if (onlyUser) q = q.eq('user_id', onlyUser)
  const { data: subs, error } = await q
  if (error) return json({ error: error.message }, 500)

  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  let sent = 0
  let removed = 0
  for (const [userId, list] of byUser) {
    const pending = test ? list : list.filter((s) => s.last_sent_on !== today)
    if (!pending.length) continue

    const { data: items } = await admin
      .from('inventory')
      .select('expires_on, quantity, ingredients(name)')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .not('expires_on', 'is', null)
      .lte('expires_on', addDays(today, DAYS_AHEAD))
      .order('expires_on')

    const rows = (items ?? []) as unknown as { expires_on: string; ingredients: { name: string } | null }[]
    if (!rows.length && !test) continue

    const parts = rows.slice(0, 3).map((r) => `${r.ingredients?.name ?? 'Un ingrediente'} (${when(r.expires_on, today)})`)
    const more = rows.length > 3 ? ` y ${rows.length - 3} más` : ''
    const payload = JSON.stringify(
      rows.length
        ? { title: 'Úsalo pronto', body: `${parts.join(', ')}${more}. El menú ya lo prioriza.`, url: `${APP_URL}#/despensa` }
        : { title: 'Avisos activados', body: 'Hoy no hay nada por caducar. Te avisaremos a las 9 a.m. cuando algo esté por vencer.', url: `${APP_URL}#/despensa` },
    )

    for (const s of pending) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 })
        sent++
        await admin.from('push_subscriptions').update({ last_sent_on: today }).eq('id', s.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410: el teléfono ya no acepta avisos (se borró la app o se quitó el permiso)
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
          removed++
        }
      }
    }
  }

  return json({ today, sent, removed })
})
