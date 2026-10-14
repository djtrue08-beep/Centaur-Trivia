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
  ['loginPanel', 'setupPanel', 'lobbyPanel', 'gamePanel'].forEach(panel => {
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
  show('introPanel');
  $('introHeading').textContent = 'WELCOME TO CENTAUR TRIVIA';
  $('introText').textContent = 'Crixus welcomes the challengers!';
  $('introContinue').disabled = true;
  const roundCount = mode === 'full' ? 6 : 3;
  const opening = 'Welcome, challengers, to Centaur Trivia! I am Crixus, master of this arena. Prepare your minds, for the contest is about to begin!';
  const rules = `Before the first round, heed these rules. Each player competes alone. Each question has four possible answers, but only one is correct. Select your answer on your phone before time expires. Once selected, your answer is locked. In round one, each correct answer earns one point. In round two, two points. Each new round adds one point per correct answer, all the way through round ${roundCount}. Wrong answers earn zero. Your standings appear after every round. Now, warriors, prepare for round one!`;
  const ready = () => {
    $('introText').textContent = 'Rules complete. The arena awaits!';
    $('introContinue').disabled = false;
  };
  CrixusVoice.speak(opening, () => {
    if (!introActive) return;
    $('introHeading').textContent = 'HOW TO PLAY & SCORING';
    $('introText').textContent = `Four choices per question. One correct answer. Round 1 = 1 point per correct answer; Round 2 = 2; each subsequent round increases by one. Wrong answers = 0. Leaderboard after every round.`;
    CrixusVoice.speak(rules, ready);
  });
  if (!CrixusVoice.enabled) ready();
}
$('introContinue').onclick = () => {
  introActive = false;
  introComplete = true;
  CrixusVoice.cancel();
  refresh();
};
$('voiceToggle').onclick = () => {
  CrixusVoice.setEnabled(!CrixusVoice.enabled);
  $('voiceToggle').textContent = CrixusVoice.enabled ? 'VOICE ON · CLICK TO MUTE' : 'VOICE OFF · CLICK TO ENABLE';
  if (!CrixusVoice.enabled && introActive) $('introContinue').disabled = false;
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
  } catch (e) { say(e.message); }
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

function narratePhase(data, key) {
  if (narratedPhaseKey === key) return;
  narratedPhaseKey = key;
  CrixusVoice.cancel();
  voiceFinished = false;
  if (data.phase === 'question') {
    if (data.number > 1 && (data.number - 1) % 5 === 0) {
      CrixusVoice.speak(`Round ${data.round} begins! A new challenge awaits!`, () => {
        if (lastPhaseKey === key) CrixusVoice.speak(data.question || '', () => { voiceFinished = true; startQuestionTimer(key); });
      });
      return;
    }
    CrixusVoice.speak(data.question || '', () => {
      voiceFinished = true;
      startQuestionTimer(key);
    });
  } else if (data.phase === 'reveal') {
    const answer = data.choices?.[data.correctAnswer];
    if (answer !== undefined) CrixusVoice.speak(`The correct answer is ${answer}.`);
  } else if (data.phase === 'leaderboard') {
    CrixusVoice.speak(`Round ${data.round} is complete. Behold the leaderboard! Let us see who commands the arena.`);
  } else if (data.phase === 'intermission') {
    CrixusVoice.speak('Even champions require a moment of rest. We shall resume shortly.');
  } else if (data.phase === 'finished') {
    const highest = data.leaderboard?.[0]?.score;
    const champions = (data.leaderboard || []).filter(player => player.score === highest);
    const names = champions.map(player => player.name);
    const announcement = names.length > 1
      ? `The contest is complete! We have a tie! ${names.join(' and ')} share the crown as champions of Centaur Trivia!`
      : `The contest is complete! All hail ${names[0] || 'our champion'}, victor of Centaur Trivia!`;
    CrixusVoice.speak(announcement);
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
  }, 5000);
}

function renderGame(data) {
  if (introActive || !introComplete) return;
  show('gamePanel');
  const key = `${data.number}:${data.phase}`;
  if (key !== lastPhaseKey) {
    clearTimeout(revealAdvanceTimeout);
    revealAdvanceTimeout = null;
    revealAdvanceKey = '';
    lastPhaseKey = key;
    $('gamePanel').dataset.phase = data.phase;
    $('gamePanel').classList.remove('phase-enter');
    void $('gamePanel').offsetWidth;
    $('gamePanel').classList.add('phase-enter');
    say('');
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
    $('gameHeading').textContent = 'CORRECT ANSWER REVEALED';
    $('clock').textContent = 'Next screen in 5 seconds';
    scheduleRevealAdvance(key);
  }
  if (data.phase === 'leaderboard') {
    renderLeaderboard(data);
    button(data.number === data.total ? 'CROWN THE WINNERS' : 'CONTINUE GAME', 'next');
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
      if (!introActive && !introComplete) introComplete = true;
      const state = await api('game-state?code=' + encodeURIComponent(code));
      renderGame(state);
    }
  } catch (e) { say(e.message); }
  finally { refreshing = false; }
}
