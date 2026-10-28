const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function setup() {
  const audio = [], spoken = [];
  const synth = { getVoices: () => [], cancel() {}, pause() {}, resume() {}, speak(u) { spoken.push(u); } };
  class Audio {
    constructor(src) { this.src = src; this.plays = 0; this.pauses = 0; audio.push(this); }
    play() { this.plays++; return Promise.resolve(); }
    pause() { this.pauses++; }
    removeAttribute() {}
    load() {}
  }
  const context = vm.createContext({ window: { speechSynthesis: synth, SpeechSynthesisUtterance: class {} }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, Audio, localStorage: { getItem: () => '{}', setItem() {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/crixus-recordings.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/crixus-voice.js'), 'utf8') + '\nthis.voice = CrixusVoice;', context);
  return { voice: context.voice, clips: context.window.CrixusRecordings, audio, spoken };
}
test('all exact mappings point at existing MP3 files and current source dialogue', () => {
  const { clips } = setup();
  const host = fs.readFileSync(path.join(root, 'assets/host.js'), 'utf8');
  const library = JSON.parse(host.match(/const dialogueLibrary = (\{[\s\S]*?\n\});/)[1]);
  const lines = Object.values(library).flat();
  lines.push(host.match(/const opening = nextDialogue\('introductions'\) \+ '([^']*)';/)[1]);
  lines.push(' This final question is worth five hundred points.');
  lines.push('The crown is shared tonight! Congratulations to our champions!');
  for (const [round, points] of [[1,100],[2,100],[2,200],[3,200],[3,300],[4,200],[5,300],[6,300]]) {
    lines.push(`Round ${round}! Correct answers are worth ${points} points. `);
  }
  for (let round = 1; round <= 6; round++) lines.push(`Round ${round} is complete. `);
  assert.equal(clips.length, fs.readdirSync(path.join(root, 'assets/audio')).filter(name => name.endsWith('.mp3')).length);
  assert.ok(clips.length > 0);
  for (const clip of clips) {
    assert.ok(lines.includes(clip.text));
    assert.ok(fs.statSync(path.join(root, clip.src)).size > 1000);
  }
});
test('recorded line uses audio and completes once', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  voice.speak(clips[0].text, () => done++);
  assert.equal(audio[0].src, clips[0].src); assert.equal(spoken.length, 0);
  const ended = audio[0].onended; ended(); ended(); assert.equal(done, 1);
});
test('intro recording finishes before untouched rules and ready callback', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  const rules = ' My digital assistant will read the questions. Choose one of four answers on your phone.';
  voice.speak(clips[0].text + rules, () => done++);
  assert.equal(spoken.length, 0); audio[0].onended();
  assert.equal(spoken[0].text, rules); assert.equal(done, 0);
  spoken[0].onend(); assert.equal(done, 1);
});
test('browser instructions before a clip are retained', () => {
  const { voice, clips, audio, spoken } = setup();
  voice.speak('Round 1! ' + clips[0].text);
  assert.equal(spoken[0].text, 'Round 1! '); assert.equal(audio.length, 0);
  spoken[0].onend(); assert.equal(audio[0].src, clips[0].src);
});
test('missing recording uses browser without requesting a nonexistent file', () => {
  const { voice, audio, spoken } = setup();
  voice.speak('Unrecorded fallback test.'); assert.equal(audio.length, 0);
  assert.equal(spoken[0].text, 'Unrecorded fallback test.');
});
test('failed audio falls back once and is skipped on subsequent attempts', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  voice.speak(clips[0].text, () => done++);
  const fail = audio[0].onerror; fail(); fail();
  assert.equal(spoken.length, 1); assert.equal(spoken[0].text, clips[0].text);
  spoken[0].onend(); assert.equal(done, 1);
  voice.speak(clips[0].text); assert.equal(audio.length, 1); assert.equal(spoken.length, 2);
});
test('questions and settings previews always use browser voice', () => {
  const { voice, clips, audio, spoken } = setup();
  voice.speakQuestion(clips[0].text); voice.speakWithSettings(clips[0].text, { rate: 1.2 });
  assert.equal(audio.length, 0); assert.equal(spoken.length, 2); assert.equal(spoken[1].rate, 1.2);
});
test('pause and resume control recorded audio', () => {
  const { voice, clips, audio } = setup();
  voice.speak(clips[0].text); voice.pause(); assert.equal(audio[0].pauses, 1);
  voice.resume(); assert.equal(audio[0].plays, 2);
});
test('cancel prevents stale completion and queued rules', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  voice.speak(clips[0].text + ' Rules follow.', () => done++);
  const ended = audio[0].onended; voice.cancel(); ended();
  assert.equal(spoken.length, 0); assert.equal(done, 0);
});
test('muting stops audio and returns completion without speaking', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  voice.speak(clips[0].text); voice.setEnabled(false);
  voice.speak(clips[0].text, () => done++);
  assert.equal(audio.length, 1); assert.equal(spoken.length, 0); assert.equal(done, 1);
});

test('full opening plays recorded introduction then recorded instructions before ready', () => {
  const { voice, clips, audio, spoken } = setup(); let done = 0;
  const host = fs.readFileSync(path.join(root, 'assets/host.js'), 'utf8');
  const rules = host.match(/const opening = nextDialogue\('introductions'\) \+ '([^']*)';/)[1];
  assert.ok(clips.some(clip => clip.text === rules));
  voice.speak(clips[0].text + rules, () => done++);
  audio[0].onended(); assert.equal(done, 0);
  assert.equal(audio[1].src, clips.find(clip => clip.text === rules).src);
  audio[1].onended(); assert.equal(done, 1); assert.equal(spoken.length, 0);
});

test('every approved gameplay host announcement uses recordings without browser speech', () => {
  const { voice, clips, audio, spoken } = setup();
  const host = fs.readFileSync(path.join(root, 'assets/host.js'), 'utf8');
  const library = JSON.parse(host.match(/const dialogueLibrary = (\{[\s\S]*?\n\});/)[1]);
  const rules = host.match(/const opening = nextDialogue\('introductions'\) \+ '([^']*)';/)[1];
  const announcements = Object.values(library).flat();
  announcements.push(...library.introductions.map(line => line + rules));
  for (const [round, points] of [[1,100],[2,100],[2,200],[3,200],[3,300],[4,200],[5,300],[6,300]]) {
    announcements.push(...library.rounds.map(line => `Round ${round}! Correct answers are worth ${points} points. ` + line));
  }
  for (let round = 1; round <= 6; round++) {
    announcements.push(...library.leaderboards.map(line => `Round ${round} is complete. ` + line));
  }
  announcements.push(...library.finals.map(line => line + ' This final question is worth five hundred points.'));
  announcements.push('The crown is shared tonight! Congratulations to our champions!');
  assert.equal(clips.length, 142);
  for (const text of announcements) {
    audio.length = 0; spoken.length = 0; let done = 0;
    voice.speak(text, () => done++);
    for (let index = 0; index < audio.length; index++) audio[index].onended();
    assert.equal(spoken.length, 0, text);
    assert.equal(done, 1, text);
  }
});
