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

  function voices() { return supported ? synth.getVoices() : []; }
  function save(next) {
    settings = { ...settings, ...next };
    try { localStorage.setItem(store, JSON.stringify(settings)); } catch {}
  }
  function cancel() {
    token++;
    if (supported) synth.cancel();
    activeUtterance = null;
  }
  function speak(text, onComplete = () => {}, previewSettings = null) {
    cancel();
    const current = token;
    if (!enabled || !supported || !text) { onComplete(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number((previewSettings || settings).rate ?? 1.05);
    utterance.pitch = Number((previewSettings || settings).pitch ?? 0.80);
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
  return {
    speak, cancel, voices, save,
    speakWithSettings(text, previewSettings) { speak(text, () => {}, previewSettings); },
    get settings() { return { ...settings }; },
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(value) { enabled = supported && Boolean(value); save({ enabled }); cancel(); }
  };
})();
