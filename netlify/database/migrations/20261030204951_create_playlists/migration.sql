CREATE TABLE "playlists" (
	"browser_id" uuid PRIMARY KEY,
	"decks" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
