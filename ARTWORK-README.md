# Centaur Trivia cinematic artwork upgrade

This package adds three original vector scene assets: `assets/arena-stage.svg`, `assets/final-stage.svg`, and `assets/transition-stage.svg`. The existing game logic, API endpoints, Supabase configuration and voice code were preserved. The host screen uses actual SVG background artwork rather than gradients alone.

The scene artwork is stylized SVG, not the exact previously generated photorealistic mockup. Test the preview before merging into production.

## Deploy
1. Keep the `cinematic-upgrade` branch selected in GitHub.
2. Upload the contents of this ZIP's `Centaur-Trivia-cinematic-upgrade` folder to the repository root, replacing matching files and adding the new SVG assets.
3. Wait for the Vercel Preview deployment to show Ready.
4. Open the Preview URL, hard refresh, and check the lobby, question, final, leaderboard and phone screens.
5. Leave your production branch unchanged until tests pass.
