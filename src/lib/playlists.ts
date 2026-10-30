import { z } from 'zod'

const track = z.object({
  name: z.string().min(1).max(1024),
  bpm: z.number().positive().finite().optional(),
  duration: z.number().nonnegative().finite().optional(),
})
export const savedPlaylists = z.tuple([z.array(track).max(2000), z.array(track).max(2000)])
export type SavedTrack = z.infer<typeof track>

// Saved URLs cannot authorize access to local audio in a new browser session.
export function missingTrackCount(saved: SavedTrack[][], available: { name: string; url?: string }[][]) {
  return saved.reduce((total, deck, i) => total + deck.filter(track =>
    !available[i].some(local => local.name === track.name && local.url),
  ).length, 0)
}
