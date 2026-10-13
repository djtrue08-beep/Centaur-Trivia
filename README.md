# Centaur Trivia — Multiplayer Lobby v1

This package replaces the prototype homepage and adds a secure host login, six-character room codes, QR joining, 60-player lobby display, and player join pages. This is a **lobby prototype**, not a complete trivia engine.

## Install
1. Back up the existing GitHub repository (download ZIP from GitHub).
2. Unzip this package and upload the **contents** into the root of your existing Centaur-Trivia repository, preserving `api/` and `assets/` directories. Commit changes. Existing `api/health.js` and `api/database-test.js` can stay.
3. In Vercel Production environment variables, ensure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `HOST_PASSWORD`, and `SESSION_SECRET` are configured. Never commit keys to GitHub. Redeploy after environment-variable changes.
4. Open the Production deployment URL. Select Quick or Full Game, log in, create a room, and use a second device to join.

## Database assumptions
- `game_rooms`: `id` UUID with default, `room_code` unique text, `status` text default `waiting`, `created_at` timestamp.
- `players`: `id` UUID with default, `room_id` UUID foreign key, `player_name` text, `score` numeric default 0, `joined_at` timestamp with default.
- RLS enabled on both tables. The server-only Supabase secret key is used for server operations.

## Important limits
- Host login is shared-password authentication and is suitable for a small trusted hosting team, not public multi-admin use. Add rate limiting before wider public use.
- Host sessions last eight hours; player sessions last six. Sessions are signed, HttpOnly, Secure cookies.
- Lobby refreshes every three seconds (polling, not Supabase Realtime).
- Room capacity checks are not transactionally atomic; concurrent joins could briefly exceed 60. Enforce limits in the database for a production-scale event.
- The host session is not scoped to a particular room; any authenticated host can manage rooms.
- QR generation uses a CDN-hosted QR library; if blocked, the clickable join URL remains available.
- Game mode is selected on the host screen but is not yet persisted in the `game_rooms` schema. The gameplay phase will need to store it.
- `START GAME` only changes room status to `playing`. Questions, scoring, and voice are not implemented.
- For testing use the **Production** deployment URL, not a preview deployment if the environment variables are Production-only.
