# Centaur Trivia gameplay update

This package uses your existing Supabase tables and Vercel environment variables. Do not add credentials to files.

## Database prerequisites

- `game_rooms`: `id`, `room_code`, `mode`, `status`, `current_question_number`, `game_phase`, `question_started_at`, `question_ends_at`
- `players`: `id` UUID, `room_id`, `name`, `score`, `joined_at`
- `questions`: `id` int8, `question_text`, `choices` JSONB array, `correct_answer` integer index 0–4, `difficulty`, `category`
- `game_questions`: `room_id`, `question_id`, `round_number`, `question_number`
- `player_answers`: `room_id`, `player_id`, `question_id`, `selected_answer`

Your prior SQL steps created these. The server uses the Supabase secret key, not a public browser key.

## Deploy

Upload/commit the updated files to the GitHub repository root (do not nest the folder). Vercel will deploy automatically. Keep existing environment variables.

## Smoke test

1. Open the host page with `?mode=quick`, log in, create a room.
2. Join with a separate phone browser using the QR code.
3. Start Game. Question 1 appears on host; phone waits.
4. Read the question and click START 12-SECOND TIMER.
5. Choose an answer on the phone; answer locks. The host automatically reveals after the timer or when all players answer.
6. Click NEXT QUESTION; every five questions view the leaderboard.
7. Full Game has six rounds and a host-controlled intermission after round three.

## Known limitations before public events

- No prerecorded Crixus audio is included. The host manually begins each timer.
- This version uses polling (about once per second), not WebSockets. With 60 players, Supabase/Vercel usage and latency may be substantial. Test with a few devices before a live event.
- Scoring and phase changes use separate Supabase requests rather than one database transaction. Production deployment should move reveal/scoring to a single atomic SQL RPC, especially for concurrent hosts or transient database errors.
- A player who refreshes their phone loses the current UI session because the room code is stored in JavaScript memory. Rejoining with the same name is blocked. Keep the phone tab open during play.
- The server checks answer deadlines before inserting, but for strict anti-race enforcement the deadline should be enforced inside a database RPC.
- Scores award round-number points for each correct answer (1 point in round one, 2 in round two, etc.). This can be adjusted after gameplay testing.
- The host must keep the host page open to automatically trigger question reveals.
