# Crixus recordings

11 completed Obsidian recordings are installed. `Crixus_Index.csv` preserves the exact 125 dialogue-library entries, source references, conversion status, and installation status. Missing recordings retain their original numbering.

Voice: Obsidian (`QjEdRoRdZC2i3ncmFpNy`); model: `eleven_v4`.

`../crixus-recordings.js` maps exact dialogue text to each completed MP3. When adding recordings, keep sequential filenames and add their exact source text and asset path to that mapping. `../crixus-voice.js` plays matching clips and uses the browser voice for missing/erroring clips. Combined intros play the recording followed by the existing browser-read rules. Questions and voice-settings previews always use the browser voice. Pause, resume, cancellation, and mute cover both playback types.

Generation limits: five attempted lines failed with an ElevenLabs free-tier access restriction, and generation stopped at line 017 after the per-minute limit. Those failures and unprocessed lines are listed in the index. The supplied audio decodes successfully; pronunciation has not been independently audited.

Run playback logic checks with `node --test tests/crixus-voice.test.cjs` from the repository root.
