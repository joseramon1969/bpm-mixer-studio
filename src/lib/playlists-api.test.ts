import { beforeEach, expect, it, vi } from 'vitest'
import handler from '../../netlify/functions/playlists.mts'

const { db, find, insert, upsert } = vi.hoisted(() => {
  const find = vi.fn()
  const upsert = vi.fn()
  const insert = vi.fn(() => ({ onConflictDoUpdate: upsert }))
  return { find, insert, upsert, db: { select: () => ({ from: () => ({ where: find }) }), insert: () => ({ values: insert }) } }
})
vi.mock('../../db/index.js', () => ({ database: () => db }))
const browser = 'c20cb4fb-13af-4dc8-a8dd-087f99fcaf01'
const request = (method: string, body?: unknown, cookie = true, origin = 'https://mixer.example') => new Request('https://mixer.example/.netlify/functions/playlists', {
  method, headers: { origin, ...(cookie ? { cookie: `bpm-browser=${browser}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
beforeEach(() => { vi.clearAllMocks(); find.mockResolvedValue([]); upsert.mockResolvedValue(undefined) })

it('creates isolated browser storage and disables caching', async () => {
  const response = await handler(request('GET', undefined, false))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([[], []])
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict')
  expect(response.headers.get('set-cookie')).toContain('Secure')
  expect(find).not.toHaveBeenCalled()
})

it('reads the current browser playlist and persists only metadata', async () => {
  find.mockResolvedValue([{ decks: [[{ name: 'Tema' }], []] }])
  expect(await (await handler(request('GET'))).json()).toEqual([[{ name: 'Tema' }], []])
  const response = await handler(request('PUT', [[{ name: 'Tema', bpm: 120, duration: 180, url: 'blob:private' }], []]))
  expect(response.status).toBe(204)
  expect(insert).toHaveBeenCalledWith({ browserId: browser, decks: [[{ name: 'Tema', bpm: 120, duration: 180 }], []] })
})

it('rejects cross-origin and unidentified writes', async () => {
  expect((await handler(request('PUT', [[], []], true, 'https://another.example'))).status).toBe(403)
  expect((await handler(request('PUT', [[], []], false))).status).toBe(401)
  expect(insert).not.toHaveBeenCalled()
})

it.each([null, [[]], [[{ name: 'Tema', bpm: -1 }], []]])('rejects invalid playlist data: %j', async body => {
  expect((await handler(request('PUT', body))).status).toBe(400)
  expect(insert).not.toHaveBeenCalled()
})

it('reports storage failures without leaking database details', async () => {
  find.mockRejectedValue(new Error('private database error'))
  const response = await handler(request('GET'))
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private database error')
})
