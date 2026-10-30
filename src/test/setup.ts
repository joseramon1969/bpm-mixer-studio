import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

if (typeof window !== 'undefined') {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
}

// Keep component tests independent of a running Netlify API.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) =>
    init?.method === 'PUT' ? new Response(null, { status: 204 }) : Response.json([[], []]),
  ))
})
