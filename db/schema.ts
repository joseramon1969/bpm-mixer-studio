import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { SavedTrack } from '../src/lib/playlists.js'

export const playlists = pgTable('playlists', {
  browserId: uuid('browser_id').primaryKey(),
  decks: jsonb('decks').$type<SavedTrack[][]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
