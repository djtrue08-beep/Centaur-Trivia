# Centaur Trivia Version 2

## Updates
- Quick 3 × 5 + 1 final; Full 6 × 5 + 1 final.
- Round scores: Quick 100/200/300, Full 100/100/200/200/300/300; final 500.
- Brown and gilded-gold host theme, Cormorant Garamond questions; green player phones.
- Automatic five-second answer reveal and fifteen-second leaderboard transitions, with host-controlled intermission after Full round 3.
- Final winner display supports ties.
- Host restores the same room after a browser refresh within the same tab session. Players can refresh/reconnect with their existing signed browser session.

## Important limitations
- Existing signed cookies must still be present for reconnection. Joining under an existing name from another browser is intentionally blocked to prevent score theft.
- Automatic progression relies on the host page staying open; the server is not a background scheduler.
- Voice quality and browser speech synthesis availability depend on the host browser.
- Requires the existing Supabase tables, credentials, and a populated question bank of at least 16 or 31 records.
- Test on a Vercel preview deployment before replacing the live site.
