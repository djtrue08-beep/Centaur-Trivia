
const CrixusVoice = (() => {
    const supported =
        "speechSynthesis" in window &&
        "SpeechSynthesisUtterance" in window;

    let enabled = supported;
    let token = 0;

    function cancel() {
        token += 1;

        if (supported) {
            window.speechSynthesis.cancel();
        }
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
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = "en-US";

        const voices = window.speechSynthesis.getVoices();

        const preferred = voices.find(
            voice =>
                voice.default &&
                voice.lang.toLowerCase().startsWith("en")
        );

        if (preferred) {
            utterance.voice = preferred;
        }

        let completed = false;

        const finish = () => {
            if (completed || current !== token) {
                return;
            }

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

        get enabled() {
            return enabled;
        },

        get supported() {
            return supported;
        },

        setEnabled(value) {
            enabled = supported && value;
            cancel();
        }
    };
})();
