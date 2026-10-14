# Centaur Trivia: Leaderboard + Pause + Arena Animations

## Installation order

1. **Back up your working GitHub repository.** Do not delete your existing deployment.
2. Open Supabase **SQL Editor** for the existing Centaur Trivia project. Run `SUPABASE-PAUSE-SETUP.sql` once. It adds two columns to `game_rooms` and does not remove any data or change game-phase constraints.
3. Upload the contents of `Centaur-Trivia-main` to your GitHub repository, preserving the folder structure. The new `api/pause-game.js` endpoint is required.
4. Wait for Vercel to show **Ready**, then start a **new** room.
5. Test using one host Chromebook and one player phone: pause during a live question, verify both screens show pause, wait longer than 12 seconds, resume, verify the countdown continues and answers are accepted; check the top-five leaderboard after five questions.

## Notes

- Pausing is saved in Supabase. Answers already locked in remain saved. New answers are blocked during pause.
- This update retains the working `game-state.js` numeric question-ID fix.
- The host Pause button is visible after the intro and during active gameplay. Full Game intermission still requires manual resume via its existing game control.
- Browser text-to-speech is paused on the host Chromebook and resumed on continuation. Audio timing depends on the ChromeOS voice engine.
- JavaScript syntax checks are not a substitute for testing the deployed Supabase and Vercel environment.
