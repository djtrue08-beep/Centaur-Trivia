const $ = id => document.getElementById(id);
let mode = new URLSearchParams(location.search).get('mode') === 'full' ? 'full' : 'quick';
$('lobbyMode').value = mode;
function chooseMode(nextMode) {
  mode = nextMode;
  $('lobbyMode').value = mode;
  $('modeLabel').textContent = mode === 'full' ? 'Full Game' : 'Quick Game';
  for (const option of ['quick', 'full']) {
    const element = $(option + 'Mode');
    const selected = option === mode;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-pressed', String(selected));
  }
}
$('quickMode').onclick = () => chooseMode('quick');
$('fullMode').onclick = () => chooseMode('full');
chooseMode(mode);
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
let gamePaused = false;
let pauseBusy = false;
let pausedVoiceDone = null;
let pausedRevealRemaining = null;
let pausedBoardRemaining = null;
let revealDueAt = 0;
let boardDueAt = 0;

function syncHostControls() {
  const active = introComplete && !!code && !['finished', 'lobby'].includes($('gamePanel').dataset.phase);
  $('setupControls').classList.toggle('hidden', active);
  $('pauseToggle').classList.toggle('hidden', !active || gamePaused);
  $('fullscreenToggle').classList.remove('hidden');
  $('pauseOverlay').classList.toggle('hidden', !gamePaused);
  if (!active && !gamePaused) $('voiceSettings').classList.add('hidden');
}

async function setPaused(paused) {
  if (pauseBusy || !code) return;
  pauseBusy = true;
  try {
    await api('room-control', {
      method: 'POST',
      body: JSON.stringify({ code, paused, operation: 'pause' })
    });
    applyPause(paused);
    await refresh();
  } catch (e) { say(e.message); }
  finally { pauseBusy = false; }
}

function applyPause(paused) {
  if (gamePaused === paused) return;
  gamePaused = paused;
  if (paused) {
    pausedRevealRemaining = revealAdvanceTimeout ? Math.max(0, revealDueAt - Date.now()) : null;
    pausedBoardRemaining = leaderboardAdvanceTimeout ? Math.max(0, boardDueAt - Date.now()) : null;
    clearTimeout(revealAdvanceTimeout);
    clearTimeout(leaderboardAdvanceTimeout);
    revealAdvanceTimeout = null;
    leaderboardAdvanceTimeout = null;
    CrixusVoice.pause();
  } else {
    CrixusVoice.resume();
    if (pausedRevealRemaining !== null && lastPhaseKey.endsWith(':reveal')) {
      revealAdvanceKey = '';
      scheduleRevealAdvance(lastPhaseKey, pausedRevealRemaining);
    }
    if (pausedBoardRemaining !== null && lastPhaseKey.endsWith(':leaderboard')) {
      leaderboardAdvanceKey = '';
      scheduleLeaderboardAdvance(lastPhaseKey, pausedBoardRemaining);
    }
    pausedRevealRemaining = null;
    pausedBoardRemaining = null;
    if (pausedVoiceDone) {
      const callback = pausedVoiceDone;
      pausedVoiceDone = null;
      callback();
    }
  }
  syncHostControls();
}

// Fullscreen requires a direct user click in Chrome/Chromebook.
function syncFullscreenButton() {
  const fullscreen = !!document.fullscreenElement;
  $('fullscreenToggle').textContent = fullscreen ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
  $('fullscreenToggle').setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
}

$('fullscreenToggle').onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    alert('Fullscreen is unavailable in this browser: ' + error.message);
  }
  syncFullscreenButton();
};
document.addEventListener('fullscreenchange', syncFullscreenButton);

$('pauseToggle').onclick = () => setPaused(true);
$('resumeGame').onclick = () => setPaused(false);

$('endSession').onclick = () => {
  if (!gamePaused) return;
  $('endSessionConfirm').classList.remove('hidden');
  $('endSession').classList.add('hidden');
};

$('cancelEndSession').onclick = () => {
  $('endSessionConfirm').classList.add('hidden');
  $('endSession').classList.remove('hidden');
};

$('confirmEndSession').onclick = async () => {
  if (!gamePaused || pauseBusy || actionBusy || !code) return;
  actionBusy = true;
  $('confirmEndSession').disabled = true;
  try {
    await api('room-control', {
      method: 'POST',
      body: JSON.stringify({ code, operation: 'end-session' })
    });
    resetHostForLobby();
    $('endSessionConfirm').classList.add('hidden');
    $('endSession').classList.remove('hidden');
    await refresh();
    say('Session ended. All players are back in the lobby.');
  } catch (exception) {
    say(exception.message);
  } finally {
    actionBusy = false;
    $('confirmEndSession').disabled = false;
  }
};

function openVoiceSettings() {
  $('voiceSettings').open = true;
  $('voiceSettings').classList.remove('hidden');
  populateVoices();
  $('voiceSelect').value = CrixusVoice.settings.voiceURI || '';
  $('voiceRate').value = CrixusVoice.settings.rate ?? 0.92;
  $('voicePitch').value = CrixusVoice.settings.pitch ?? 0.83;
  syncVoiceLabels();
}
function closeVoiceSettings() {
  // A voice preview can interrupt the paused narration. Continue safely on resume.
  if (gamePaused && lastPhaseKey.endsWith(':question')) {
    pausedVoiceDone = () => startQuestionTimer(lastPhaseKey);
  } else if (gamePaused && lastPhaseKey.endsWith(':reveal') && pausedRevealRemaining === null) {
    pausedVoiceDone = () => scheduleRevealAdvance(lastPhaseKey);
  }
  CrixusVoice.cancel();
  $('voiceSettings').open = false;
  $('voiceSettings').classList.add('hidden');
}
$('settingsToggle').onclick = openVoiceSettings;
$('pauseOptions').onclick = openVoiceSettings;
$('cancelVoice').onclick = closeVoiceSettings;

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
  if (id !== 'gamePanel') $('leaderboardStage').classList.add('hidden');
  ['loginPanel', 'setupPanel', 'lobbyPanel', 'introPanel', 'gamePanel'].forEach(panel => {
    $(panel).classList.toggle('hidden', panel !== id);
  });
  syncHostControls();
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


function resetHostForLobby() {
  CrixusVoice.cancel();
  CrixusVoice.resume();
  clearTimeout(revealAdvanceTimeout);
  clearTimeout(leaderboardAdvanceTimeout);
  clearTimeout(roundCurtainTimeout);
  ++introSequenceToken;
  lastPhaseKey = '';
  narratedPhaseKey = '';
  autoTimerKey = '';
  revealAdvanceKey = '';
  leaderboardAdvanceKey = '';
  roundCurtainKey = '';
  introComplete = false;
  introActive = false;
  gamePaused = false;
  $('gamePanel').dataset.phase = 'lobby';
  $('pauseOverlay').classList.add('hidden');
  $('endSessionConfirm').classList.add('hidden');
  $('endSession').classList.remove('hidden');
  pausedVoiceDone = null;
  pausedRevealRemaining = null;
  pausedBoardRemaining = null;
  $('leaderboardStage').classList.add('hidden');
  $('roundCurtain').classList.add('hidden');
  show('lobbyPanel');
}

async function replayGame(returnToLobby) {
  if (!code || actionBusy) return;
  actionBusy = true;
  $('playAgain').disabled = true;
  $('returnLobby').disabled = true;
  try {
    await api('room-control', {
      method: 'POST',
      body: JSON.stringify({ code, operation: 'replay' })
    });
    resetHostForLobby();
    await refresh();
    if (returnToLobby) {
      say('Lobby reopened. Players may join or leave.');
    } else {
      $('start').disabled = true;
      const data = await api('start-game', {
        method: 'POST',
        body: JSON.stringify({ code, mode })
      });
      say(data.message);
      showIntro();
    }
  } catch (exception) {
    say(exception.message);
    // If reset succeeded but game start failed, remain in lobby to retry.
    await refresh();
  } finally {
    actionBusy = false;
    $('playAgain').disabled = false;
    $('returnLobby').disabled = false;
  }
}

$('playAgain').onclick = () => replayGame(false);
$('returnLobby').onclick = () => replayGame(true);

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
  if (gamePaused) CrixusVoice.resume();
  CrixusVoice.speakWithSettings('Hey everybody, I am Crixus. Welcome to Centaur Trivia. Let us have some fun!', voiceSelection());
};
$('saveVoice').onclick = () => {
  CrixusVoice.save(voiceSelection());
  closeVoiceSettings();
  say('Voice settings saved.');
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
  resetDialogueDecks();
  const opening = nextDialogue('introductions') + ' My digital assistant will read the questions. Choose one of four answers on your phone. Once you lock in, there is no changing it. Correct answers earn points. Let the contest begin!';
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
      method: 'POST', body: JSON.stringify({ code, mode: $('lobbyMode').value })
    });
    mode = $('lobbyMode').value;
    say(data.message);
    showIntro();
  } catch (e) { say(e.message); $('start').disabled = false; }
};

async function gameAction(action) {
  if (actionBusy || gamePaused) return;
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
  const stage = $('leaderboardStage');
  const rows = $('boardRows');
  rows.replaceChildren();
  stage.classList.remove('hidden');
  const finished = data.phase === 'finished';
  $('boardTitle').textContent = finished ? 'CHAMPIONS OF THE ARENA' : 'LEADERBOARD';
  $('boardSubtitle').textContent = finished ? 'THE FINAL STANDINGS' : `AFTER ROUND ${data.round}`;
  const players = data.leaderboard || [];
  const best = players[0]?.score;
  const champions = finished ? players.filter(person => person.score === best) : [];
  const displayed = finished ? champions : players.slice(0, 5);
  displayed.forEach((person, index) => {
    const line = document.createElement('div');
    line.className = 'board-row' + (index === 0 ? ' first-place' : '');
    const rank = document.createElement('span');
    rank.className = 'board-rank';
    rank.textContent = index === 0 ? '♛' : String(index + 1);
    const name = document.createElement('strong');
    name.textContent = person.name;
    const score = document.createElement('span');
    score.className = 'board-score';
    score.textContent = Number(person.score || 0).toLocaleString();
    line.append(rank, name, score);
    rows.append(line);
  });
  $('championActions').classList.toggle('hidden', !finished);
  $('boardFooter').textContent = finished
    ? `${champions.length} ${champions.length === 1 ? 'CHAMPION' : 'CHAMPIONS'} CROWNED`
    : 'THE NEXT CHALLENGE AWAITS';
}

function startQuestionTimer(key) {
  if (gamePaused) { pausedVoiceDone = () => startQuestionTimer(key); return; }
  if (lastPhaseKey !== key || autoTimerKey === key || actionBusy) return;
  autoTimerKey = key;
  gameAction('timer');
}

const dialogueLibrary = {
  "introductions": [
    "What's going on everybody? I'm Crixus, and welcome to Centaur Trivia!",
    "Welcome in, everybody! Crixus here, and I've got questions for you.",
    "Good to see you all! I'm Crixus, and tonight we're putting that confidence to the test.",
    "Welcome to Centaur Trivia! I'm Crixus, and I'm ready to see what you know.",
    "Hey, everybody! Crixus on the mic. Let's have a little friendly competition.",
    "Welcome, players! I'm Crixus, and I hope you brought your thinking caps.",
    "What's happening, family? I'm Crixus, and we're about to have some fun.",
    "Welcome to the game! I'm Crixus, and I promise the questions won't bite.",
    "Glad you made it! Crixus here. Let's find out who's been paying attention.",
    "Everybody ready? I'm Crixus. Let's get this trivia night rolling."
  ],
  "questions": [
    "Let's see what you've got.",
    "Here's one to think about.",
    "Keep your eyes on the screen.",
    "Time to put that knowledge to work.",
    "Don't overthink this one.",
    "Ready for another?",
    "Here's your next challenge.",
    "Trust your instincts.",
    "Let's keep the momentum going.",
    "This one could shake things up.",
    "Alright, here we go.",
    "Let's see who's locked in.",
    "Pay attention to this one.",
    "A little brainpower, please.",
    "Let's make this interesting.",
    "Somebody's going to love this question.",
    "Let's see who's on a roll.",
    "Phones ready? Here it comes.",
    "I've got another one for you.",
    "Now we're getting somewhere."
  ],
  "reveals": [
    "There's your answer! Hope you trusted yourself.",
    "Some of y'all knew that. Some of y'all guessed with confidence.",
    "That's the one! How'd everybody do?",
    "Now we know. No changing your answer after the fact!",
    "There it is! Somebody just learned something.",
    "If you got that right, take a quiet victory lap.",
    "Some of y'all are on fire tonight.",
    "That's your answer. No arguing with the screen.",
    "Somebody out there is feeling real smart.",
    "Well, that was interesting!",
    "The correct answer has spoken for itself.",
    "A few of y'all probably surprised yourselves.",
    "I can hear the excuses warming up already.",
    "That's how the points are earned.",
    "The scoreboard might get interesting after that one.",
    "No shame in learning something new.",
    "You either knew it or made a very lucky guess.",
    "This Centaur respects a solid answer.",
    "If you missed it, there's another chance coming.",
    "That one definitely separated the guesses from the knowledge.",
    "The answer is in. Let's keep moving.",
    "Somebody's confidence just went up a notch.",
    "I hope you didn't second-guess yourself.",
    "A little trivia wisdom for the road.",
    "And that's another one in the books."
  ],
  "rounds": [
    "Let's keep the good energy going.",
    "New round, fresh opportunity.",
    "The competition is heating up.",
    "Everybody's still got a shot.",
    "Time to turn things up a little.",
    "Let's see who can make a move.",
    "New round. Same confidence. Better answers, hopefully.",
    "Stay focused. This could change everything.",
    "Nobody's out of it yet.",
    "Let's get right back to it.",
    "A fresh round means fresh chances.",
    "The points are getting serious now.",
    "Keep your phones ready and your minds sharp.",
    "This Centaur likes a close contest.",
    "Let's see who rises to the challenge."
  ],
  "leaderboards": [
    "Let's check the standings.",
    "Time to see who's making moves.",
    "Here's where everybody stands.",
    "Let's find out who's leading the pack.",
    "The numbers don't lie. Let's take a look.",
    "Somebody's climbing that leaderboard.",
    "Let's see who came to compete.",
    "The scoreboard has a story to tell.",
    "Who's up, who's down? Let's see.",
    "Let's check on our front-runners.",
    "There might be a surprise in these standings.",
    "Take a look at that leaderboard.",
    "The race is getting interesting.",
    "Let's see who has bragging rights right now.",
    "Here come the standings. No excuses!"
  ],
  "finals": [
    "This is it! One last question.",
    "The final question is here. Make it count.",
    "Alright, everybody, this is your moment.",
    "One more question before we crown a champion.",
    "Time for the final challenge. Stay sharp.",
    "Here's where things get interesting. Final question!",
    "You've made it this far. Finish strong.",
    "One question left. No pressure. Well, maybe a little.",
    "Let's see who can close this thing out.",
    "This Centaur loves a dramatic finish. Here we go!"
  ],
  "champions": [
    "We have our champion! Give it up for a well-earned win!",
    "That's a wrap! Congratulations to our winner!",
    "Somebody came ready to play tonight. Congratulations!",
    "We have a winner! Everybody else, there's always next time.",
    "Big congratulations! That's how you finish a trivia game.",
    "And the crown goes to our champion! Well played.",
    "That's what I'm talking about! Congratulations to the winner.",
    "The results are in, and we've got our champion!",
    "Respect where it's due. Excellent game!",
    "A strong finish and a well-deserved victory!",
    "This Centaur tips his hat to tonight's winner.",
    "Give our champion some love! That was a good game.",
    "We have a champion! Go ahead and enjoy those bragging rights.",
    "What a finish! Congratulations to our winner.",
    "That's the game, everybody! Let's hear it for the champion!"
  ],
  "breaks": [
    "We're taking a quick break. Don't wander too far.",
    "Short intermission, everybody. We'll be right back.",
    "Time to stretch those legs. All four, if you've got them.",
    "Take a moment to reset. More trivia is coming.",
    "Quick break. Save the trash talk for the next round.",
    "We're pausing for a moment. Stay close.",
    "Grab some water and come back ready.",
    "Take a breather. The next round is waiting.",
    "We'll be back shortly. Don't lose that momentum.",
    "Intermission time. You've earned a quick rest."
  ],
  "lobby": [
    "Back to the lobby, everybody. Let's get ready for another round.",
    "We're resetting the game. Hang tight, everyone.",
    "New game coming up. Same crew, fresh start.",
    "We're back in the lobby. Get those phones ready.",
    "That's a reset. Let's get the next game started."
  ]
};

const dialogueDecks = {};
function resetDialogueDecks() {
  for (const category of Object.keys(dialogueLibrary)) {
    dialogueDecks[category] = [];
  }
}
function nextDialogue(category) {
  const choices = dialogueLibrary[category];
  if (!choices || !choices.length) return '';
  if (!dialogueDecks[category] || !dialogueDecks[category].length) {
    // Shuffle a full deck so each line plays before the next cycle begins.
    const indices = choices.map((_, index) => index);
    for (let index = indices.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [indices[index], indices[other]] = [indices[other], indices[index]];
    }
    dialogueDecks[category] = indices;
  }
  return choices[dialogueDecks[category].pop()];
}
resetDialogueDecks();

function roundPoints(round) {
  return mode === 'quick' ? round * 100 : Math.ceil(round / 2) * 100;
}
function narratePhase(data, key) {
  if (gamePaused) return;
  if (narratedPhaseKey === key) return;
  narratedPhaseKey = key;
  CrixusVoice.cancel();
  voiceFinished = false;
  if (data.phase === 'question') {
    const isFinal = data.number === data.total;
    const isRoundStart = !isFinal && (data.number - 1) % 5 === 0;
    const readQuestion = () => {
      if (lastPhaseKey !== key) return;
      $('roundCurtain').classList.add('hidden');
      CrixusVoice.speakQuestion(data.question || '', () => {
        voiceFinished = true;
        startQuestionTimer(key);
      });
    };
    if (isFinal) {
      CrixusVoice.speak(nextDialogue('finals') + ' This final question is worth five hundred points.', readQuestion);
    } else if (isRoundStart) {
      CrixusVoice.speak(`Round ${data.round}! Correct answers are worth ${roundPoints(data.round)} points. ` + nextDialogue('rounds'), readQuestion);
    } else if (Math.random() < 0.18) {
      CrixusVoice.speak(nextDialogue('questions'), readQuestion);
    } else {
      readQuestion();
    }
  } else if (data.phase === 'reveal') {
    CrixusVoice.speak(nextDialogue('reveals'), () => scheduleRevealAdvance(key));
  } else if (data.phase === 'leaderboard') {
    CrixusVoice.speak(`Round ${data.round} is complete. ` + nextDialogue('leaderboards'));
  } else if (data.phase === 'intermission') {
    CrixusVoice.speak(nextDialogue('breaks'));
  } else if (data.phase === 'finished') {
    const highest = data.leaderboard?.[0]?.score;
    const count = (data.leaderboard || []).filter(p => p.score === highest).length;
    CrixusVoice.speak(count === 1
      ? nextDialogue('champions')
      : `The crown is shared by ${count} champions tonight! Well played, warriors!`);
  }
}

function scheduleRevealAdvance(key, delay = 3200) {
  if (revealAdvanceKey === key) return;
  clearTimeout(revealAdvanceTimeout);
  revealAdvanceKey = key;
  revealDueAt = Date.now() + delay;
  revealAdvanceTimeout = setTimeout(() => {
    revealAdvanceTimeout = null;
    if (lastPhaseKey === key && !actionBusy && !gamePaused) {
      gameAction('next');
    }
  }, delay);
}

function scheduleLeaderboardAdvance(key, delay = 8500) {
  if (leaderboardAdvanceKey === key) return;
  clearTimeout(leaderboardAdvanceTimeout);
  leaderboardAdvanceKey = key;
  boardDueAt = Date.now() + delay;
  leaderboardAdvanceTimeout = setTimeout(() => {
    if (lastPhaseKey === key && !actionBusy && !gamePaused) gameAction('next');
  }, delay);
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
  applyPause(!!data.paused);
  $('leaderboardStage').classList.toggle('hidden', !['leaderboard', 'finished'].includes(data.phase));
  syncHostControls();
  const key = `${data.number}:${data.phase}`;
  if (key !== lastPhaseKey) {
    clearTimeout(leaderboardAdvanceTimeout);
    leaderboardAdvanceKey = '';
    clearTimeout(revealAdvanceTimeout);
    revealAdvanceTimeout = null;
    revealAdvanceKey = '';
    lastPhaseKey = key;
    pausedRevealRemaining = null;
    pausedBoardRemaining = null;
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
  $('gameMeta').textContent = data.number === data.total
    ? 'FINAL QUESTION · 500 POINTS'
    : `ROUND ${data.round} · QUESTION ${((data.number - 1) % 5) + 1}/5`;
  $('gameHeading').textContent = data.phase === 'finished' ? 'GAME COMPLETE' : '';
  $('category').textContent = data.category || '';
  $('questionText').textContent = data.question || '';
  $('progress').textContent = `${data.answeredCount} / ${data.playerCount} players answered`;
  $('clock').classList.add('hidden');
  $('leaderboard').classList.add('hidden');
  $('voiceHint').classList.toggle('hidden', data.phase !== 'question');
  $('voiceHint').textContent = CrixusVoice.enabled
    ? 'Crixus’s digital assistant is reading the question. The timer starts when it finishes.'
    : 'Voice is off. The timer starts automatically; manual start is also available.';
  $('gameButton').classList.add('hidden');
  $('hostChoices').replaceChildren();
  const reveal = ['reveal', 'leaderboard', 'intermission', 'finished'].includes(data.phase);
  if (reveal && data.correctAnswer !== null) {
    const correctChoice = data.choices?.[data.correctAnswer];

    if (correctChoice !== undefined) {
      const line = document.createElement('div');

      line.className = 'host-choice correct';
      line.textContent = String(correctChoice).toUpperCase();

      $('hostChoices').append(line);
    }
  }
  if (data.phase === 'question' && !CrixusVoice.enabled) button('START TIMER NOW', 'timer');
  if (data.phase === 'answering') {
    const remaining = Math.max(0, Math.ceil((data.paused ? data.remainingMs : Date.parse(data.endsAt) - Date.now()) / 1000));
    $('clock').classList.remove('hidden');
    $('clockNumber').textContent = remaining;
    $('clock').style.setProperty('--remaining', Math.min(1, remaining / 12));
    $('clock').classList.toggle('clock-urgent', remaining <= 5);
    if (!gamePaused && (remaining === 0 || (data.playerCount > 0 && data.answeredCount >= data.playerCount)) && !actionBusy) {
      gameAction('finish');
    }
  }
  if (data.phase === 'reveal') {
    $('gameHeading').textContent = 'THE CORRECT ANSWER';
    $('questionText').textContent = '';
    $('category').textContent = '';
    $('progress').textContent = '';
    $('clock').classList.add('hidden'); 
    if (!CrixusVoice.enabled) scheduleRevealAdvance(key);
  }
  if (data.phase === 'leaderboard') {
    renderLeaderboard(data);
    $('clock').classList.add('hidden');
    // Advancement is automatic; the Pause menu remains available.
    if (!gamePaused) scheduleLeaderboardAdvance(key);
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
  if (!gamePaused) narratePhase(data, key);
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
    else (room.members || room.players.map(name => ({ name }))).forEach(member => {
      const element = document.createElement('div');
      element.className = 'player';
      const name = document.createElement('span');
      name.textContent = member.name;
      element.append(name);
      if (room.status === 'waiting' && member.id) {
        const remove = document.createElement('button');
        remove.className = 'outline player-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${member.name}`);
        remove.title = `Remove ${member.name}`;
        remove.onclick = async () => {
          try {
            await api('room-control', {
              method: 'POST',
              body: JSON.stringify({ code, playerId: member.id, operation: 'remove' })
            });
            await refresh();
          } catch (e) { say(e.message); }
        };
        element.append(remove);
      }
      $('players').append(element);
    });
    $('start').disabled = room.count === 0 || room.status !== 'waiting';
    if (room.status === 'waiting' && $('lobbyPanel').classList.contains('hidden')) {
      show('lobbyPanel');
    }
    if (room.status !== 'waiting') {
      if (!introActive && !introComplete && room.status === 'finished') introComplete = true;
      const state = await api('game-state?code=' + encodeURIComponent(code));
      renderGame(state);
    }
  } catch (e) { say(e.message); }
  finally { refreshing = false; }
}

