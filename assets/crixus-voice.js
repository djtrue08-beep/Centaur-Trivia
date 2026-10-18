// Browser voices available on this device. Preferences stay in this browser.
const CrixusVoice = (() => {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  const store = 'centaur-crixus-voice-v2';
  let settings;
  try { settings = JSON.parse(localStorage.getItem(store) || '{}'); }
  catch { settings = {}; }
  let enabled = supported && settings.enabled !== false;
  let token = 0;
  let activeUtterance = null;
  let activeAudio = null;
  const unavailableClips = new Set();

  function clipId(text) {
    // Stable identifier for the exact spoken line, including combined announcements.
    let hash = 2166136261;
    for (const character of text) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function voices() { return supported ? synth.getVoices() : []; }
  function save(next) {
    settings = { ...settings, ...next };
    try { localStorage.setItem(store, JSON.stringify(settings)); } catch {}
  }
  function cancel() {
    token++;
    if (supported) synth.cancel();
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio.load();
      activeAudio = null;
    }
    activeUtterance = null;
  }
  function speakBrowser(text, onComplete = () => {}, previewSettings = null) {
    cancel();
    const current = token;
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
  }
  function speak(text, onComplete = () => {}, previewSettings = null) {
    if (previewSettings || !text || !enabled) {
      speakBrowser(text, onComplete, previewSettings);
      return;
    }
    cancel();
    const current = token;
    const id = clipId(text);
    if (unavailableClips.has(id)) {
      speakBrowser(text, onComplete);
      return;
    }
    const audio = new Audio(`/assets/audio/crixus-${id}.mp3`);
    activeAudio = audio;
    audio.onended = () => {
      if (current !== token) return;
      activeAudio = null;
      onComplete();
    };
    audio.onerror = () => {
      if (current !== token) return;
      activeAudio = null;
      unavailableClips.add(id);
      speakBrowser(text, onComplete);
    };
    audio.play().catch(() => {
      if (current !== token) return;
      activeAudio = null;
      speakBrowser(text, onComplete);
    });
  }

  return {
    speak, cancel, voices, save,
    // Questions are intentionally delegated to Chrome, never to a recorded Crixus clip.
    speakQuestion(text, onComplete = () => {}) {
      // The digital assistant always uses Chrome, never Crixus recordings.
      speakBrowser(text, onComplete);
    },
    speakWithSettings(text, previewSettings) { speak(text, () => {}, previewSettings); },
    get settings() { return { ...settings }; },
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(value) { enabled = supported && Boolean(value); save({ enabled }); cancel(); }
  };
})();
