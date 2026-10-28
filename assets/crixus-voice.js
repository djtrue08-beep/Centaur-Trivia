// Recorded Crixus dialogue, with the browser voice for unrecorded lines/questions.
const CrixusVoice = (() => {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  const store = 'centaur-crixus-voice-v2';
  const recordings = window.CrixusRecordings || [];
  const unavailableClips = new Set();
  let settings;
  try { settings = JSON.parse(localStorage.getItem(store) || '{}') || {}; }
  catch { settings = {}; }
  let enabled = supported && settings.enabled !== false;
  let token = 0;
  let paused = false;
  let activeUtterance = null;
  let activeAudio = null;

  function voices() { return supported ? synth.getVoices() : []; }
  function save(next) {
    settings = { ...settings, ...next };
    try { localStorage.setItem(store, JSON.stringify(settings)); } catch {}
  }
  function cancel() {
    token++;
    if (supported) synth.cancel();
    if (activeAudio) {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio.load();
      activeAudio = null;
    }
    activeUtterance = null;
  }
  function pause() {
    paused = true;
    if (supported) synth.pause();
    if (activeAudio) activeAudio.pause();
  }
  function resume() {
    paused = false;
    if (supported) synth.resume();
    if (activeAudio) {
      const audio = activeAudio;
      audio.play().catch(() => {
        if (activeAudio === audio) audio.onerror?.();
      });
    }
  }
  function playBrowser(text, current, onComplete, previewSettings = null) {
    if (current !== token) return;
    if (!enabled || !supported || !text) { onComplete(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number((previewSettings || settings).rate ?? 0.92);
    utterance.pitch = Number((previewSettings || settings).pitch ?? 0.83);
    utterance.volume = Number(settings.volume ?? 1);
    const available = voices();
    const selected = available.find(v => v.voiceURI === (previewSettings || settings).voiceURI);
    const fallback = available.find(v => v.lang.startsWith('en') && /male|david|daniel|guy|mark/i.test(v.name));
    if (selected || fallback) utterance.voice = selected || fallback;
    let completed = false;
    const finish = () => {
      if (completed || current !== token) return;
      completed = true;
      activeUtterance = null;
      onComplete();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    activeUtterance = utterance;
    synth.speak(utterance);
    if (paused) synth.pause();
  }
  function speakBrowser(text, onComplete = () => {}, previewSettings = null) {
    cancel();
    playBrowser(text, token, onComplete, previewSettings);
  }
  function segments(text) {
    // Keep rule/point instructions around recorded dialogue, without rewriting.
    const result = [];
    let rest = text;
    while (rest) {
      let match = null;
      let offset = rest.length;
      for (const clip of recordings) {
        if (!clip.text) continue;
        const index = rest.indexOf(clip.text);
        if (index !== -1 && (index < offset || (index === offset && clip.text.length > (match?.text.length || 0)))) {
          match = clip;
          offset = index;
        }
      }
      if (!match) { result.push({ text: rest }); break; }
      if (offset) result.push({ text: rest.slice(0, offset) });
      result.push(match);
      rest = rest.slice(offset + match.text.length);
    }
    return result;
  }
  function speak(text, onComplete = () => {}, previewSettings = null) {
    if (previewSettings || !text || !enabled) {
      speakBrowser(text, onComplete, previewSettings);
      return;
    }
    cancel();
    const current = token;
    const queue = segments(text);
    function next() {
      if (current !== token) return;
      const segment = queue.shift();
      if (!segment) { onComplete(); return; }
      if (!segment.src || unavailableClips.has(segment.src)) {
        playBrowser(segment.text, current, next);
        return;
      }
      const audio = new Audio(segment.src);
      audio.volume = Number(settings.volume ?? 1);
      activeAudio = audio;
      let settled = false;
      const finish = (failed) => {
        if (settled || current !== token) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        activeAudio = null;
        if (failed) {
          audio.pause();
          unavailableClips.add(segment.src);
          playBrowser(segment.text, current, next);
        } else next();
      };
      audio.onended = () => finish(false);
      audio.onerror = () => finish(true);
      if (!paused) audio.play().catch(() => finish(true));
    }
    next();
  }

  return {
    speak, cancel, pause, resume, voices, save,
    // Trivia questions always use the browser's digital assistant voice.
    speakQuestion(text, onComplete = () => {}) { speakBrowser(text, onComplete); },
    speakWithSettings(text, previewSettings) { speak(text, () => {}, previewSettings); },
    get settings() { return { ...settings }; },
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(value) { enabled = supported && Boolean(value); save({ enabled }); cancel(); }
  };
})();
