// Crixus voice adapter. Replace speak() later with prerecorded ElevenLabs audio.
const CrixusVoice = (() => {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let enabled = supported;
  let token = 0;

  function cancel() {
    token += 1;
    if (supported) window.speechSynthesis.cancel();
  }

  function speak(text, onComplete = () => {}) {
    cancel();
    const current = token;
    if (!enabled || !text || !supported) {
      onComplete();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.83;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && /male|david|daniel|guy|mark/i.test(v.name));
    if (preferred) utterance.voice = preferred;
    let completed = false;
    const finish = () => {
      if (completed || current !== token) return;
      completed = true;
      onComplete();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  return {
    speak,
    cancel,
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(value) { enabled = supported && value; cancel(); }
  };
})();
