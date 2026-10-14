# Centaur Trivia · Coordinated Polish Update

## Changes included

- Four-character room codes with at least one letter and one number; ambiguous letters and digits excluded. Existing six-character rooms are accepted for backward compatibility.
- Minimal cinematic question display with a gold circular 12-second countdown, plus pulsing final seconds.
- Consistent brown-and-gold host background and reduced question-screen headings.
- Voice settings Save Changes closes the dialog; Cancel closes it; Test Voice previews settings without saving.
- Pause overlay retains Resume Game, which resumes the server-side timer and players' game state.
- Play Again on the final champion screen reopens the **same** room with the same code and existing player sessions. Scores and old answers are cleared, and the host chooses Quick or Full Game again.
- Remove buttons in the waiting lobby allow the host to remove absent players.

## Install

1. Keep a backup of your current working GitHub repository.
2. Upload the **contents** of the `Centaur-Trivia-main` folder from this ZIP to your existing GitHub repository, preserving the folders `api` and `assets`.
3. Let Vercel deploy the updated commit. Do not create a new Vercel project.
4. No new Supabase columns or SQL migrations are introduced by this update. Your existing pause-related database columns must already be present.
5. Open the host on your Chromebook, create a room, and test with two phones before using it at a live event.

## Suggested live testing

1. Confirm a new code contains four characters, including a letter and a number. Join using the code and QR link.
2. Run a Quick Game and confirm the gold timer and simple question display.
3. Pause during an active countdown; save voice settings; confirm the dialog closes and Resume Game continues the countdown.
4. Complete the game; press Play Again. Confirm both phones return to waiting without rejoining, the same room code remains, and scores restart at zero.
5. Change to Full Game, add another player, remove a test player, and start again.

## Important limitations

- This ZIP was statically checked but **not** tested against your live Supabase database, Vercel deployment, or Chromebook speech engine. Validate with a small test game before replacing your event-ready build.
- Replaying a room resets the previous game results in that room. Keep a screenshot or export of the winners before pressing Play Again if you need a record.
- Voice availability depends on ChromeOS's installed speech voices; this update cannot install new voices.
- Keep a backup of your current working ZIP so you can revert if a live integration issue occurs.
