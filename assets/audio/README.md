# Crixus recordings

46 completed Obsidian recordings are installed. `Crixus_Index.csv` preserves the exact 125 dialogue-library entries, source references, conversion status, and installation status. Missing recordings retain their original numbering.

Voice: Obsidian (`QjEdRoRdZC2i3ncmFpNy`); model: `eleven_v4`.

`../crixus-recordings.js` maps exact dialogue text to each completed MP3. When adding recordings, keep sequential filenames and add their exact source text and asset path to that mapping. `../crixus-voice.js` plays matching clips and uses the browser voice for missing/erroring clips. Combined intros play the recording followed by the existing browser-read rules. Questions and voice-settings previews always use the browser voice. Pause, resume, cancellation, and mute cover both playback types.

Generation limits: five attempted lines failed with an ElevenLabs free-tier access restriction, and generation stopped at line 017 after the per-minute limit. Those failures and unprocessed lines are listed in the index. The supplied audio decodes successfully; pronunciation has not been independently audited.

Run playback logic checks with `node --test tests/crixus-voice.test.cjs` from the repository root.

Follow-up batch: 8 additional recordings installed (017, 019–022, 024, 028–029). Eight attempted generations failed with the same free-tier restriction. Line 033 was blocked by the per-minute limit without starting. Total installed: 19; conversion failures: 13; not generated: 93.

Third batch: 14 additional recordings installed (033–042, 044–047). Line 043 failed with the free-tier restriction; line 048 hit the per-minute limit without starting. Current totals: 33 installed, 14 conversion failures, 78 not generated.

Latest batch: 13 additional recordings installed (049–054, 056–059, 061–063). Lines 048, 055, and 060 failed with the free-tier restriction; line 064 hit the per-minute limit without starting. Current totals: 46 installed, 17 conversion failures, 62 not generated.
