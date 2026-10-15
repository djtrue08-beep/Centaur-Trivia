const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
$('code').value = (params.get('code') || '').toUpperCase();
let code = '';
let timer = null;
let busy = false;
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

$('joinForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const data = await api('join-room', {
      method: 'POST',
      body: JSON.stringify({ code: $('code').value, name: $('name').value })
    });
    code = data.roomCode;
    $('formPanel').classList.add('hidden');
    $('waiting').classList.remove('hidden');
    say('Joined as ' + data.playerName);
    await refresh();
    timer = setInterval(refresh, 1000);
  } catch (e) { say(e.message); }
};

async function submit(choice) {
  if (busy) return;
  busy = true;
  try {
    await api('submit-answer', {
      method: 'POST', body: JSON.stringify({ choice })
    });
    say('Answer locked!');
    await refresh();
  } catch (e) { say(e.message); }
  finally { busy = false; }
}

function showLeaderboard(data) {
  const board = $('playerLeaderboard');
  board.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = data.phase === 'finished' ? 'FINAL STANDINGS' : 'LEADERBOARD';
  board.append(heading);
  (data.leaderboard || []).slice(0, data.phase === 'finished' ? 12 : 5).forEach((person, index) => {
    const row = document.createElement('p');
    const rank = (data.leaderboard || []).findIndex(p => p.score === person.score) + 1;
    row.textContent = `${rank}. ${person.name} — ${person.score} points`;
    board.append(row);
  });
  if (data.phase === 'finished' && data.leaderboard?.length) {
    const best = data.leaderboard[0].score;
    const winners = data.leaderboard.filter(p => p.score === best).map(p => p.name);
    $('playerHeading').textContent = '👑 ' + winners.join(' & ') + ' 👑';
  }
}

function renderGame(data) {
  $('playerPause').classList.toggle('hidden', !data.paused);
  $('waiting').classList.add('hidden');
  $('playerGame').classList.remove('hidden');
  $('playerMeta').textContent = `ROUND ${data.round} · QUESTION ${data.number}/${data.total}`;
  $('playerHeading').textContent = 'CHOOSE YOUR ANSWER';
  $('playerQuestion').textContent = ''; // Questions appear on the host screen only.
  $('playerLeaderboard').replaceChildren();
  $('answerChoices').replaceChildren();
  $('playerClock').textContent = '';
  $('answerStatus').textContent = '';
  if (data.phase === 'intro') {
    $('playerHeading').textContent = 'WELCOME TO THE ARENA';
    $('answerStatus').textContent = 'Crixus is explaining the rules. Get ready!';
  }
  if (data.phase === 'question') {
    $('playerHeading').textContent = 'GET READY';
    $('answerStatus').textContent = 'Waiting for Crixus to finish the question...';
  }
  if (data.phase === 'answering') {
    const remaining = Math.max(0, Math.ceil((data.paused ? data.remainingMs : Date.parse(data.endsAt) - Date.now()) / 1000));
    $('playerClock').textContent = remaining + 's';
    if (data.myAnswer !== null) $('answerStatus').textContent = '⭐ Answer locked!';
    else if (!remaining) $('answerStatus').textContent = 'Time is up!';
    (Array.isArray(data.choices) ? data.choices : []).forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'answer-option';
      const star = document.createElement('span');
      star.className = 'answer-star';
      star.textContent = '★';
      const answerText = document.createElement('span');
      answerText.textContent = choice;
      button.append(star, answerText);
      button.disabled = data.paused || data.myAnswer !== null || remaining === 0;
      if (data.myAnswer === index) button.classList.add('chosen');
      button.onclick = () => submit(data.choiceIndices?.[index] ?? index);
      $('answerChoices').append(button);
    });
  }
  if (data.phase === 'reveal') {
    $('playerHeading').textContent = 'ANSWER REVEAL';
    const correct = data.choices?.[data.correctAnswer];
    $('answerStatus').textContent = data.myAnswer === data.correctAnswer ? '✓ Correct!' : 'Correct answer: ' + correct;
  }
  if (data.phase === 'leaderboard' || data.phase === 'finished') {
    $('playerHeading').textContent = data.phase === 'finished' ? 'GAME COMPLETE' : 'ROUND COMPLETE';
    showLeaderboard(data);
  }
  if (data.phase === 'intermission') {
    $('playerHeading').textContent = 'INTERMISSION';
    $('answerStatus').textContent = 'Waiting for the host to resume.';
  }
}

let refreshing = false;
async function refresh() {
  if (!code || refreshing) return;
  refreshing = true;
  try {
    const room = await api('room-state?code=' + encodeURIComponent(code));
    $('count').textContent = room.count;
    if (room.status === 'waiting') {
      $('playerPause').classList.add('hidden');
      $('playerGame').classList.add('hidden');
      $('waiting').classList.remove('hidden');
      $('phase').textContent = 'New game coming soon. You are still connected!';
    } else {
      const state = await api('game-state?code=' + encodeURIComponent(code));
      renderGame(state);
    }
  } catch (e) {
    say(e.message);
    if (/removed from this room/i.test(e.message)) {
      clearInterval(timer);
      $('playerPause').classList.add('hidden');
      $('playerGame').classList.add('hidden');
      $('waiting').classList.add('hidden');
      $('formPanel').classList.remove('hidden');
      code = '';
    }
  }
  finally { refreshing = false; }
}
