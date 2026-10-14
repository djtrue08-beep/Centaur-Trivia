const $ = id => document.getElementById(id);
const mode = new URLSearchParams(location.search).get('mode') === 'full' ? 'full' : 'quick';
$('modeLabel').textContent = mode === 'full' ? 'Full Game' : 'Quick Game';
let code = '';
let timer = null;
let lastPhaseKey = '';
let actionBusy = false;
let narratedPhaseKey = '';
let autoTimerKey = '';
let voiceFinished = false;
let revealAdvanceTimeout = null;
let revealAdvanceKey = '';
let leaderboardAdvanceKey = '';
let leaderboardAdvanceTimeout = null;
let roundCurtainKey = '';
let roundCurtainTimeout = null;
let introSequenceToken = 0;

const say = text => { $('message').textContent = text; };

async function api(path, options = {}) {
  const response = await fetch('/api/' + path, {
    credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

function show(id) {
  ['loginPanel', 'setupPanel', 'lobbyPanel', 'introPanel', 'gamePanel'].forEach(panel => {
    $(panel).classList.toggle('hidden', panel !== id);
  });
}

(async () => {
  try {
    show((await api('host-session')).authenticated ? 'setupPanel' : 'loginPanel');
  } catch (e) { say(e.message); }
})();

$('loginForm').onsubmit = async event => {
  event.preventDefault();
  try {
    await api('host-login', {
      method: 'POST', body: JSON.stringify({ password: $('password').value })
    });
    $('password').value = '';
    say('Host authenticated');
    show('setupPanel');
  } catch (e) { say(e.message); }
};

$('logout').onclick = async () => {
  await api('host-logout', { method: 'POST' });
  show('loginPanel');
  say('Logged out');
};

$('create').onclick = async () => {
  try {
    $('create').disabled = true;
    const data = await api('create-room', {
      method: 'POST', body: JSON.stringify({ mode })
    });
    code = data.room_code;
    $('roomCode').textContent = code;
    const url = new URL('/join.html', location.origin);
    url.searchParams.set('code', code);
    $('joinLink').href = url.href;
    $('joinLink').textContent = url.href;
    $('qr').textContent = '';
    if (window.QRCode) new QRCode($('qr'), { text: url.href, width: 170, height: 170 });
    else $('qr').textContent = 'Use the join link below';
    show('lobbyPanel');
    say('Room created');
    await refresh();
    timer = setInterval(refresh, 1000);
  } catch (e) { say(e.message); $('create').disabled = false; }
};

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('joinLink').href);
    say('Join link copied');
  } catch { say('Copy the displayed join link'); }
};

// Voice settings are stored locally on the host Chromebook.
function populateVoices() {
  const select = $('voiceSelect');
  const previous = select.value || CrixusVoice.settings.voiceURI || '';
  select.replaceChildren(new Option('System default', ''));
  CrixusVoice.voices().forEach(voice => {
    select.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
  });
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}
populateVoices();
if (CrixusVoice.supported) speechSynthesis.addEventListener('voiceschanged', populateVoices);
$('voiceRate').value = CrixusVoice.settings.rate ?? 0.92;
$('voicePitch').value = CrixusVoice.settings.pitch ?? 0.83;
function syncVoiceLabels() {
  $('rateValue').textContent = $('voiceRate').value;
  $('pitchValue').textContent = $('voicePitch').value;
}
$('voiceRate').oninput = syncVoiceLabels;
$('voicePitch').oninput = syncVoiceLabels;
syncVoiceLabels();
function voiceSelection() {
  return {
    voiceURI: $('voiceSelect').value,
    rate: Number($('voiceRate').value),
    pitch: Number($('voicePitch').value)
  };
}
$('testVoice').onclick = () => {
  CrixusVoice.save(voiceSelection());
  CrixusVoice.speak('I am Crixus the Centaur. Welcome to my arena!');
};
$('saveVoice').onclick = () => {
  CrixusVoice.save(voiceSelection());
  say('Crixus voice settings saved on this Chromebook.');
};
let introActive = false;
let introComplete = false;
function showIntro() {
  introActive = true;
  introComplete = false;
  const sequence = ++introSequenceToken;
  lastPhaseKey = '';
  narratedPhaseKey = '';
  show('introPanel');
  $('introHeading').textContent = 'CENTAUR TRIVIA';
  $('introText').textContent = 'WELCOME TO THE ARENA';
  $('introContinue').disabled = true;
  const opening = 'Welcome, mortals, to Centaur Trivia! I am Crixus, master of this arena. Listen well! I shall read each question. Choose one of four answers on your phone before time runs out. Once chosen, your answer is locked. Each correct answer earns points, and I shall announce the stakes before each round. Now, let the battle of minds begin!';
  const ready = () => {
    if (!introActive || sequence !== introSequenceToken) return;
    $('introHeading').textContent = 'CENTAUR TRIVIA';
    $('introText').textContent = 'THE ARENA AWAKENS';
    $('introContinue').disabled = false; // Manual fallback if network advancement fails.
    setTimeout(() => {
      if (introActive && sequence === introSequenceToken) beginFirstRound();
    }, 2500);
  };
  CrixusVoice.speak(opening, ready);
  if (!CrixusVoice.enabled) ready();
}
function beginFirstRound() {
  introActive = false;
  introComplete = true;
  CrixusVoice.cancel();
  $('introContinue').disabled = true;
  gameAction('begin');
}
$('introContinue').onclick = beginFirstRound;
$('voiceToggle').onclick = () => {
  CrixusVoice.setEnabled(!CrixusVoice.enabled);
  $('voiceToggle').textContent = CrixusVoice.enabled ? 'VOICE ON · CLICK TO MUTE' : 'VOICE OFF · CLICK TO ENABLE';
  if (!CrixusVoice.enabled && introActive) { ++introSequenceToken; $('introContinue').disabled = false; beginFirstRound(); }
  if (!CrixusVoice.enabled && voiceFinished === false && lastPhaseKey.endsWith(':question')) {
    voiceFinished = true;
    startQuestionTimer(lastPhaseKey);
  }
};

$('start').onclick = async () => {
  try {
    $('start').disabled = true;
    const data = await api('start-game', {
      method: 'POST', body: JSON.stringify({ code })
    });
    say(data.message);
    showIntro();
  } catch (e) { say(e.message); $('start').disabled = false; }
};

async function gameAction(action) {
  if (actionBusy) return;
  actionBusy = true;
  $('gameButton').disabled = true;
  try {
    await api(action === 'timer' ? 'start-timer' : 'game-action', {
      method: 'POST',
      body: JSON.stringify(action === 'timer' ? { code } : { code, action })
    });
    await refresh();
  } catch (e) { say(e.message); if (action === 'begin') { introActive = true; introComplete = false; show('introPanel'); $('introContinue').disabled = false; } }
  finally { actionBusy = false; $('gameButton').disabled = false; }
}

$('gameButton').onclick = () => {
  const action = $('gameButton').dataset.action;
  if (action) gameAction(action);
};

function button(text, action) {
  $('gameButton').textContent = text;
  $('gameButton').dataset.action = action;
  $('gameButton').classList.remove('hidden');
}

function renderLeaderboard(data) {
  const board = $('leaderboard');
  board.replaceChildren();
  board.classList.remove('hidden');
  const heading = document.createElement('h3');
  heading.textContent = data.phase === 'finished' ? 'FINAL WINNERS' : 'ROUND LEADERBOARD';
  board.append(heading);
  (data.leaderboard || []).forEach((person, index) => {
    const line = document.createElement('p');
    line.textContent = `${index + 1}. ${person.name} — ${person.score} points`;
    board.append(line);
  });
  if (data.phase === 'finished' && data.leaderboard?.length) {
    const high = data.leaderboard[0].score;
    const names = data.leaderboard.filter(p => p.score === high).map(p => p.name);
    $('gameHeading').textContent = '👑 ' + names.join(' & ') + ' 👑';
  }
}

function startQuestionTimer(key) {
  if (lastPhaseKey !== key || autoTimerKey === key || actionBusy) return;
  autoTimerKey = key;
  gameAction('timer');
}

const revealLines = [
  'Knowledge favors the worthy!',
  'Some of you have pleased the gods. Others, not so much.',
  'The arena rewards sharp minds!',
  'Ha! That separated warriors from spectators!',
  'The gods have spoken. Onward!',
  'Impressive. Perhaps there is hope for you yet.',
  'A simple challenge. Or so I thought!',
  'I expected brilliance. Some of you delivered!',
  'The crown is not won by guessing wildly!',
  'Another test conquered. Or perhaps endured.',
  'Your wisdom has been weighed!',
  'Not everyone can command the arena!',
  'Even the mighty must learn!',
  'The truth stands before you!',
  'That one demanded a worthy mind!',
  'Somewhere, a scholar just sighed.',
  'An admirable effort, mortals!',
  'The arena grows more interesting!',
  'Fortune favors the prepared!',
  'Onward, before the gods grow bored!'
];
let lastRevealLine = -1;
function randomRevealLine() {
  let index = Math.floor(Math.random() * (revealLines.length - 1));
  if (index >= lastRevealLine) index++;
  lastRevealLine = index;
  return revealLines[index];
}
function roundPoints(round) {
  return mode === 'quick' ? round * 100 : Math.ceil(round / 2) * 100;
}
function narratePhase(data, key) {
  if (narratedPhaseKey === key) return;
  narratedPhaseKey = key;
  CrixusVoice.cancel();
  voiceFinished = false;
  if (data.phase === 'question') {
    const isFinal = data.number === data.total;
    const isRoundStart = (data.number - 1) % 5 === 0;
    const readQuestion = () => {
      if (lastPhaseKey !== key) return;
      $('roundCurtain').classList.add('hidden');
      CrixusVoice.speak(data.question || '', () => {
        voiceFinished = true;
        startQuestionTimer(key);
      });
    };
    if (isFinal) {
      CrixusVoice.speak('Mortals! The final challenge has arrived. Five hundred points await those who answer correctly. Fail, and you earn nothing! Prove your worth!', readQuestion);
    } else if (isRoundStart) {
      CrixusVoice.speak(`Round ${data.round}! Each correct answer earns ${roundPoints(data.round)} points. Let the contest begin!`, readQuestion);
    } else {
      readQuestion();
    }
  } else if (data.phase === 'reveal') {
    CrixusVoice.speak(randomRevealLine(), () => scheduleRevealAdvance(key));
  } else if (data.phase === 'leaderboard') {
    CrixusVoice.speak(`Round ${data.round} is complete. Behold the standings! The arena remembers its champions.`);
  } else if (data.phase === 'intermission') {
    CrixusVoice.speak('Even champions require a moment of rest. We shall resume shortly.');
  } else if (data.phase === 'finished') {
    const highest = data.leaderboard?.[0]?.score;
    const count = (data.leaderboard || []).filter(p => p.score === highest).length;
    CrixusVoice.speak(count === 1
      ? 'Behold! One champion stands victorious. The crown is yours, mortal!'
      : `By the gods! The crown shall be shared by ${count} champions today! The arena has witnessed an extraordinary tie!`);
  }
}

function scheduleRevealAdvance(key) {
  if (revealAdvanceKey === key) return;
  clearTimeout(revealAdvanceTimeout);
  revealAdvanceKey = key;
  revealAdvanceTimeout = setTimeout(() => {
    revealAdvanceTimeout = null;
    if (lastPhaseKey === key && !actionBusy) {
      gameAction('next');
    }
  }, 3200);
}

function scheduleLeaderboardAdvance(key) {
  if (leaderboardAdvanceKey === key) return;
  clearTimeout(leaderboardAdvanceTimeout);
  leaderboardAdvanceKey = key;
  leaderboardAdvanceTimeout = setTimeout(() => {
    if (lastPhaseKey === key && !actionBusy) gameAction('next');
  }, 8500);
}

function showRoundCurtain(data, key) {
  if (roundCurtainKey === key) return;
  roundCurtainKey = key;
  clearTimeout(roundCurtainTimeout);
  const curtain = $('roundCurtain');
  $('curtainRound').textContent = data.number === data.total ? 'FINAL QUESTION' : `ROUND ${data.round}`;
  $('curtainSubtitle').textContent = data.number === data.total ? 'THE MOMENT OF TRUTH' : data.round === 1 ? 'THE ARENA OPENS' : 'THE CHALLENGE CONTINUES';
  curtain.classList.remove('hidden');
  // Keep the cinematic title visible until Crixus finishes the announcement.
  // The question narration callback dismisses the curtain.
}

function renderGame(data) {
  if (introActive || !introComplete || data.phase === 'intro') return;
  show('gamePanel');
  const key = `${data.number}:${data.phase}`;
  if (key !== lastPhaseKey) {
    clearTimeout(leaderboardAdvanceTimeout);
    leaderboardAdvanceKey = '';
    clearTimeout(revealAdvanceTimeout);
    revealAdvanceTimeout = null;
    revealAdvanceKey = '';
    lastPhaseKey = key;
    $('gamePanel').dataset.phase = data.phase;
    $('gamePanel').classList.remove('phase-enter');
    void $('gamePanel').offsetWidth;
    $('gamePanel').classList.add('phase-enter');
    say('');
    if (data.phase === 'question' && ((data.number - 1) % 5 === 0 || data.number === data.total)) {
      showRoundCurtain(data, key);
    } else {
      $('roundCurtain').classList.add('hidden');
    }
  }
  $('gameMeta').textContent = `ROUND ${data.round} OF ${data.roundCount} · QUESTION ${data.number} OF ${data.total}`;
  $('gameHeading').textContent = data.phase === 'finished' ? 'GAME COMPLETE' : 'CENTAUR TRIVIA';
  $('category').textContent = data.category || '';
  $('questionText').textContent = data.question || '';
  $('progress').textContent = `${data.answeredCount} / ${data.playerCount} players answered`;
  $('clock').textContent = '';
  $('leaderboard').classList.add('hidden');
  $('voiceHint').classList.toggle('hidden', data.phase !== 'question');
  $('voiceHint').textContent = CrixusVoice.enabled
    ? 'Crixus is reading the question. The timer starts when he finishes.'
    : 'Voice is off. The timer starts automatically; manual start is also available.';
  $('gameButton').classList.add('hidden');
  $('hostChoices').replaceChildren();
  const reveal = ['reveal', 'leaderboard', 'intermission', 'finished'].includes(data.phase);
  if (reveal && data.correctAnswer !== null) {
    const correctChoice = data.choices?.[data.correctAnswer];

    if (correctChoice !== undefined) {
      const line = document.createElement('div');

      line.className = 'host-choice correct';
      line.textContent = `CORRECT ANSWER: ${correctChoice}`;

      $('hostChoices').append(line);
    }
  }
  if (data.phase === 'question') button('START TIMER NOW', 'timer');
  if (data.phase === 'answering') {
    const remaining = Math.max(0, Math.ceil((Date.parse(data.endsAt) - Date.now()) / 1000));
    $('clock').textContent = `${remaining}s`;
    if ((remaining === 0 || (data.playerCount > 0 && data.answeredCount >= data.playerCount)) && !actionBusy) {
      gameAction('finish');
    }
  }
  if (data.phase === 'reveal') {
    $('gameHeading').textContent = 'THE CORRECT ANSWER';
    $('questionText').textContent = '';
    $('category').textContent = '';
    $('progress').textContent = '';
    $('clock').textContent = ''; 
    if (!CrixusVoice.enabled) scheduleRevealAdvance(key);
  }
  if (data.phase === 'leaderboard') {
    renderLeaderboard(data);
    $('clock').textContent = 'Next round begins automatically';
    button(data.number === data.total ? 'CROWN THE WINNERS NOW' : 'CONTINUE NOW', 'next');
    scheduleLeaderboardAdvance(key);
  }
  if (data.phase === 'intermission') {
    $('gameHeading').textContent = 'INTERMISSION';
    $('questionText').textContent = 'Take a break. The host resumes when everyone is ready.';
    $('hostChoices').replaceChildren();
    button('RESUME GAME', 'next');
  }
  if (data.phase === 'finished') {
    renderLeaderboard(data);
    $('questionText').textContent = 'Thanks for playing Centaur Trivia!';
    $('hostChoices').replaceChildren();
  }
  narratePhase(data, key);
}

let refreshing = false;
async function refresh() {
  if (!code || refreshing) return;
  refreshing = true;
  try {
    const room = await api('room-state?code=' + encodeURIComponent(code));
    $('count').textContent = room.count;
    $('players').replaceChildren();
    if (!room.players.length) $('players').textContent = 'Waiting for players...';
    else room.players.forEach(name => {
      const element = document.createElement('div');
      element.className = 'player';
      element.textContent = name;
      $('players').append(element);
    });
    $('start').disabled = room.count === 0 || room.status !== 'waiting';
    if (room.status !== 'waiting') {
      if (!introActive && !introComplete && room.status === 'finished') introComplete = true;
      const state = await api('game-state?code=' + encodeURIComponent(code));
      renderGame(state);
    }
  } catch (e) { say(e.message); }
  finally { refreshing = false; }
}

$('fullscreenToggle').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { say('Fullscreen unavailable: ' + e.message); }
};
document.addEventListener('fullscreenchange', () => {
  $('fullscreenToggle').textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN';
});
