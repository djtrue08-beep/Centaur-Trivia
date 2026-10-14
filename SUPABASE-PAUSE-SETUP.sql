-- Run once in Supabase SQL Editor before deploying this update.
-- The existing game phase check constraint does NOT need changing.
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS pause_remaining_ms integer;
