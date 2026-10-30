import { useEffect, useRef, useState } from 'react'
import { missingTrackCount, savedPlaylists } from './playlists'
import type { SavedTrack } from './playlists'

type LocalTrack = SavedTrack & { url?: string }
const endpoint = '/.netlify/functions/playlists'

export function usePlaylistStorage(lists: LocalTrack[][], onMissing: (count: number) => void) {
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Recuperando listas…')
  const [failed, setFailed] = useState(false)
  const current = useRef({ lists, onMissing })
  const writes = useRef(Promise.resolve())
  const revision = useRef(0)
  useEffect(() => { current.current = { lists, onMissing } })

  useEffect(() => {
    if (ready) return
    const controller = new AbortController()
    async function restore() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, credentials: 'same-origin' })
        if (!response.ok) throw new Error('restore')
        const saved = savedPlaylists.parse(await response.json())
        if (controller.signal.aborted) return
        let missing = missingTrackCount(saved, current.current.lists)
        // Retire metadata from the old browser-only format without trusting saved URLs.
        try {
          const legacy = localStorage.getItem('bpm-playlists')
          if (legacy) {
            const parsed = savedPlaylists.safeParse(JSON.parse(legacy))
            if (parsed.success && !saved.flat().length) missing = missingTrackCount(parsed.data, current.current.lists)
          }
        } catch { /* Browser storage may be disabled or malformed. */ }
        try { localStorage.removeItem('bpm-playlists') } catch { /* Storage may be disabled. */ }
        if (missing) current.current.onMissing(missing)
        setReady(true)
        setFailed(false)
      } catch {
        if (!controller.signal.aborted) {
          setStatus('No se pudieron recuperar las listas. Tu audio sigue disponible.')
          setFailed(true)
        }
      }
    }
    void restore()
    return () => controller.abort()
  }, [ready, attempt])

  useEffect(() => {
    if (!ready) return
    const run = ++revision.current
    let active = true
    const metadata = lists.map(deck => deck.filter(track => track.url).map(({ name, bpm, duration }) => ({ name, bpm, duration })))
    const timer = setTimeout(() => {
      setStatus('Guardando listas…')
      writes.current = writes.current.then(async () => {
        if (!active || run !== revision.current) return
        try {
          const response = await fetch(endpoint, {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata),
          })
          if (!response.ok) throw new Error('save')
          if (active && run === revision.current) { setStatus('Listas guardadas'); setFailed(false) }
        } catch {
          if (active && run === revision.current) { setStatus('No se pudieron guardar las listas.'); setFailed(true) }
        }
      })
    }, 400)
    return () => { clearTimeout(timer); active = false }
  }, [lists, ready, attempt])

  return { status, failed, retry: () => setAttempt(value => value + 1) }
}
