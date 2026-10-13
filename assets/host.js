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
let transitionKey = '';
let transitionBusy = false;
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
    const authenticated = (await api('host-session')).authenticated;
    show(authenticated ? 'setupPanel' : 'loginPanel');
    if (authenticated && sessionStorage.getItem('centaur_host_room')) {
      code = sessionStorage.getItem('centaur_host_room');
      restoreLobby();
      await refresh();
      timer = setInterval(refresh, 1000);
    }
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
  sessionStorage.removeItem('centaur_host_room');
  code = '';
  clearInterval(timer);
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
    sessionStorage.setItem('centaur_host_room', code);
    restoreLobby();
    const url = new URL('/join.html', location.origin);
    url.searchParams.set('code', code);
    $('joinLink').href = url.href;
    $('joinLink').textContent = url.href;
    show('lobbyPanel');
    say('Room created');
    await refresh();
    timer = setInterval(refresh, 1000);
  } catch (e) { say(e.message); $('create').disabled = false; }
};

function restoreLobby() {
  $('roomCode').textContent = code;
  const url = new URL('/join.html', location.origin);
  url.searchParams.set('code', code);
  $('joinLink').href = url.href;
  $('joinLink').textContent = url.href;
  $('qr').replaceChildren();
  if (window.QRCode) new QRCode($('qr'), { text: url.href, width: 170, height: 170 });
  else $('qr').textContent = url.href;
  show('lobbyPanel');
}

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('joinLink').href);
    say('Join link copied');
  } catch { say('Copy the displayed join link'); }
};

$('voiceToggle').onclick = () => {
  CrixusVoice.setEnabled(!CrixusVoice.enabled);
  $('voiceToggle').textContent = CrixusVoice.enabled ? 'VOICE ON · CLICK TO MUTE' : 'VOICE OFF · CLICK TO ENABLE';
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
    CrixusVoice.speak('Welcome, challengers, to Centaur Trivia! Let the contest begin!');
    await refresh();
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
  const people = data.leaderboard || [];
  if (data.phase === 'finished') {
    const top = people[0]?.score;
    const winners = people.filter(person => person.score === top);
    $('gameHeading').textContent = winners.length > 1 ? 'WINNERS' : 'WINNER';
    const crown = document.createElement('div');
    crown.className = 'winner-crown';
    crown.textContent = '♛';
    board.append(crown);
    winners.forEach(person => {
      const name = document.createElement('div');
      name.className = 'winner-name';
      name.textContent = person.name;
      board.append(name);
    });
    const score = document.createElement('div');
    score.className = 'winner-score';
    score.textContent = `${top ?? 0} POINTS`;
    board.append(score);
    return;
  }
  const heading = document.createElement('h3');
  heading.textContent = 'ROUND LEADERBOARD';
  board.append(heading);
  people.forEach((person, index) => {
    const line = document.createElement('p');
    line.textContent = `${index + 1}. ${person.name} — ${person.score} points`;
    board.append(line);
  });
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
    CrixusVoice.speak(data.isFinal ? `The final question, worth five hundred points! ${data.question || ''}` : (data.question || ''), () => {
      voiceFinished = true;
      startQuestionTimer(key);
    });
  } else if (data.phase === 'reveal') {
    const answer = data.choices?.[data.correctAnswer];
    if (answer !== undefined) CrixusVoice.speak(`The correct answer is ${answer}.`);
  } else if (data.phase === 'leaderboard') {
    CrixusVoice.speak('Behold the leaderboard! Let us see who commands the arena.');
  } else if (data.phase === 'intermission') {
    CrixusVoice.speak('Even champions require a moment of rest. We shall resume shortly.');
  } else if (data.phase === 'finished') {
    CrixusVoice.speak('The contest is complete! All hail the champions of Centaur Trivia!');
  }
}

function scheduleTimedAdvance(data, key, seconds) {
  const elapsed = data.endsAt ? Date.now() - Date.parse(data.endsAt) : 0;
  const remaining = Math.max(0, seconds * 1000 - elapsed);
  if (transitionKey === key) return;
  transitionKey = key;
  clearTimeout(revealAdvanceTimeout);
  revealAdvanceTimeout = setTimeout(() => {
    if (lastPhaseKey === key) {
      if (!actionBusy) gameAction('next');
      else setTimeout(() => { if (lastPhaseKey === key) gameAction('next'); }, 1200);
    }
    transitionKey = '';
  }, remaining);
}

function renderGame(data) {
  show('gamePanel');
  const key = `${data.number}:${data.phase}`;
  if (key !== lastPhaseKey) {
    clearTimeout(revealAdvanceTimeout);
    revealAdvanceTimeout = null;
    revealAdvanceKey = '';
    transitionKey = '';
    lastPhaseKey = key;
    say('');
  }
  $('gameMeta').textContent = data.isFinal ? 'FINAL QUESTION · 500 POINTS' : `ROUND ${data.round} OF ${data.roundCount} · QUESTION ${data.number} OF ${data.total}`;
  $('gamePanel').classList.toggle('final-round', !!data.isFinal);
  $('gameHeading').textContent = data.phase === 'finished' ? 'GAME COMPLETE' : 'CENTAUR TRIVIA';
  $('category').textContent = data.category || '';
  $('questionText').textContent = data.question || '';
  $('questionText').classList.toggle('long-question', (data.question || '').length > 105);
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
    scheduleTimedAdvance(data, key, 5);
  }
  if (data.phase === 'leaderboard') {
    renderLeaderboard(data);
    scheduleTimedAdvance(data, key, 15);
  }
  if (data.phase === 'intermission') {
    $('gameHeading').textContent = 'INTERMISSION';
    $('questionText').textContent = 'Take a break. The host resumes when everyone is ready.';
    $('hostChoices').replaceChildren();
    button('RESUME GAME', 'next');
  }
  if (data.phase === 'finished') {
    renderLeaderboard(data);
    $('questionText').textContent = '';
    $('category').textContent = '';
    $('progress').textContent = '';
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
      const state = await api('game-state?code=' + encodeURIComponent(code));
      renderGame(state);
    }
  } catch (e) { say(e.message); }
  finally { refreshing = false; }
}
