# Crixus recordings

130 completed Obsidian recordings are installed. `Crixus_Index.csv` preserves the exact 125 dialogue-library entries, source references, conversion status, and installation status. Missing recordings retain their original numbering.

Voice: Obsidian (`QjEdRoRdZC2i3ncmFpNy`); model: `eleven_v4`.

`../crixus-recordings.js` maps exact dialogue text to each completed MP3. When adding recordings, keep sequential filenames and add their exact source text and asset path to that mapping. `../crixus-voice.js` plays matching clips and uses the browser voice for missing/erroring clips. Combined intros play the recording followed by the existing browser-read rules. Questions and voice-settings previews always use the browser voice. Pause, resume, cancellation, and mute cover both playback types.

Generation limits: five attempted lines failed with an ElevenLabs free-tier access restriction, and generation stopped at line 017 after the per-minute limit. Those failures and unprocessed lines are listed in the index. The supplied audio decodes successfully; pronunciation has not been independently audited.

Run playback logic checks with `node --test tests/crixus-voice.test.cjs` from the repository root.

Follow-up batch: 8 additional recordings installed (017, 019–022, 024, 028–029). Eight attempted generations failed with the same free-tier restriction. Line 033 was blocked by the per-minute limit without starting. Total installed: 19; conversion failures: 13; not generated: 93.

Third batch: 14 additional recordings installed (033–042, 044–047). Line 043 failed with the free-tier restriction; line 048 hit the per-minute limit without starting. Current totals: 33 installed, 14 conversion failures, 78 not generated.

Latest batch: 13 additional recordings installed (049–054, 056–059, 061–063). Lines 048, 055, and 060 failed with the free-tier restriction; line 064 hit the per-minute limit without starting. Current totals: 46 installed, 17 conversion failures, 62 not generated.

Latest batch: 12 additional recordings installed (064–068, 071–074, 077–079). Five attempts failed with the free-tier restriction; line 081 hit the per-minute limit without starting. Current totals: 58 installed, 22 conversion failures, 45 not generated.

Latest batch: recordings 082 and 083 installed. Lines 081 and 084 failed with the free-tier restriction; line 085 was blocked because free generations were busy. Current totals: 60 installed, 24 conversion failures, 41 not generated.

Failed-line retries: 002, 004, and 006 completed and installed. Line 001 failed again with the free-tier restriction; retry of 016 was blocked because free generations were busy (prior failure status retained). Current totals: 63 installed, 21 conversion failures, 41 not generated.

Latest failed-line retries: 001, 016, 018, 032, 043, 048, 055, 060, 069, and 070 completed and installed. Six attempts failed again with the free-tier restriction; retry of 075 hit the per-minute limit (prior failure status retained). Current totals: 73 installed, 11 conversion failures, 41 not generated.

Latest batch: all 11 prior failed lines completed, plus new recordings 087 and 088. New attempts 085 and 086 failed with the free-tier restriction; line 089 hit the per-minute limit without starting. Current totals: 86 installed, 2 conversion failures, 37 not generated.

Latest batch: failed lines 085 and 086 completed, plus 089–096 and 098–101. Line 097 failed with the free-tier restriction; line 102 hit the per-minute limit without starting. Current totals: 100 installed, 1 conversion failure, 24 not generated.

Latest batch: 102, 103, 109–111, 114, and 115 completed and installed. Eight attempts failed with the free-tier restriction; line 116 hit the per-minute limit without starting. Current totals: 107 installed, 8 conversion failures, 10 not generated.

Expanded approved scope: 142 recordings. The first 125 preserve dialogueLibrary source order; 126 is the exact opening instructions; 127–134 expand the round/points template for both game modes; 135–140 expand round completion for rounds 1–6; 141 is the exact final points announcement; 142 is the user-approved generic shared-champions announcement. Template expansions are deterministic written-source expansions, not audio transcriptions. The generic tie announcement replaces the runtime winner-count wording; names and champion count remain visual. These 17 additional recordings are pending; until recorded, existing browser fallback remains.

Latest batch: 10 more recordings installed (097, 104–107, 112, 116–119). Current totals: 117 installed, 3 conversion failures, 22 not generated. 25 recordings remain across the expanded 142-line scope.

Latest batch: 120–132 completed, including the opening instructions and six round/points announcements. Lines 108 and 113 failed again; line 133 hit the per-minute limit without starting. Current totals: 130 installed, 2 conversion failures, 10 not generated. 12 recordings remain.
