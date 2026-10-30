import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { database } from '../../db/index.js'
import { playlists } from '../../db/schema.js'
import { savedPlaylists } from '../../src/lib/playlists.js'

export default async (req: Request) => {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' })
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } })
  }
  const url = new URL(req.url)
  if (req.method === 'PUT' && req.headers.get('origin') !== url.origin) {
    return new Response(null, { status: 403, headers })
  }
  const cookie = req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('bpm-browser='))?.slice(12)
  const browserId = cookie && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cookie) ? cookie : null
  if (req.method === 'PUT' && !browserId) return new Response(null, { status: 401, headers })
  try {
    const db = database()
    if (req.method === 'GET') {
      if (!browserId) {
        headers.set('Set-Cookie', `bpm-browser=${randomUUID()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`)
        return Response.json([[], []], { headers })
      }
      const [row] = await db.select({ decks: playlists.decks }).from(playlists).where(eq(playlists.browserId, browserId))
      return Response.json(row?.decks ?? [[], []], { headers })
    }
    const body = await req.text()
    if (body.length > 1024 * 1024) return new Response(null, { status: 413, headers })
    let parsed
    try { parsed = savedPlaylists.safeParse(JSON.parse(body)) } catch { return new Response(null, { status: 400, headers }) }
    if (!parsed.success) return new Response(null, { status: 400, headers })
    await db.insert(playlists).values({ browserId: browserId!, decks: parsed.data }).onConflictDoUpdate({
      target: playlists.browserId, set: { decks: parsed.data, updatedAt: new Date() },
    })
    return new Response(null, { status: 204, headers })
  } catch {
    return Response.json({ error: 'No se pudo guardar o recuperar la lista.' }, { status: 503, headers })
  }
}
