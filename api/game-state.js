import { db, host, player, json, error } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code)) return json(res, 400, { error: 'Invalid code' });
  try {
    const s = db();
    const { data: room, error: re } = await s.from('game_rooms')
      .select('id,mode,status,game_phase,current_question_number,question_ends_at,is_paused,pause_remaining_ms')
      .eq('room_code', code).maybeSingle();
    if (re) throw re;
    if (!room) return json(res, 404, { error: 'Room not found' });
    const isHost = host(req);
    const session = player(req);
    if (!isHost && (!session || session.room !== room.id)) return json(res, 401, { error: 'Join the room first' });
    const { data: players, error: pe } = await s.from('players')
      .select('id,name,score').eq('room_id', room.id).order('score', { ascending: false });
    if (pe) throw pe;
    if (!isHost && !players.some(p => p.id === session.id)) {
      return json(res, 403, { error: 'You were removed from this room' });
    }
    const roundCount = room.mode === 'full' ? 6 : 3;
    const number = room.current_question_number || 0;
    const phase = room.game_phase || 'lobby';
    const result = {
      status: room.status, phase, mode: room.mode, number,
      round: number ? Math.ceil(number / 5) : 0,
      total: roundCount * 5, roundCount,
      endsAt: room.question_ends_at,
      paused: !!room.is_paused,
      remainingMs: room.is_paused ? room.pause_remaining_ms : null,
      playerCount: players.length,
      answeredCount: 0,
      leaderboard: ['leaderboard', 'finished'].includes(phase)
        ? players.map(p => ({ name: p.name, score: p.score || 0 })) : undefined
    };
    if (room.status !== 'playing' || !number) return json(res, 200, result);
    const { data: assigned, error: ae } = await s.from('game_questions')
      .select('question_id').eq('room_id', room.id).eq('question_number', number).maybeSingle();
    if (ae) throw ae;
    if (!assigned) return json(res, 409, { error: 'Question assignment missing' });
    const { data: question, error: qe } = await s.from('questions')
      .select('id,question_text,choices,correct_answer,category')
      .eq('id', assigned.question_id).single();
    if (qe) throw qe;
    const { data: answers, error: ansError } = await s.from('player_answers')
      .select('player_id,selected_answer').eq('room_id', room.id).eq('question_id', question.id);
    if (ansError) throw ansError;
    result.answeredCount = answers.length;
    result.question = (!isHost && ['intro', 'question'].includes(phase)) ? '' : question.question_text;
    result.category = question.category;
    // Present four options without changing stored answer indices or the question bank.
    const originalChoices = question.choices || [];
    const correctIndex = question.correct_answer;
    const visibleIndices = originalChoices.map((_, index) => index);
    if (visibleIndices.length > 4) {
      const incorrect = visibleIndices.filter(index => index !== correctIndex);
      // Stable per-question omission; every device sees the same four choices.
      const omit = incorrect[String(question.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0) % incorrect.length];
      visibleIndices.splice(visibleIndices.indexOf(omit), 1);
    }
    result.choices = (isHost || phase !== 'question')
      ? visibleIndices.map(index => originalChoices[index]) : [];
    result.choiceIndices = (isHost || phase === 'answering') ? visibleIndices : [];
    result.correctAnswer = ['reveal', 'leaderboard', 'intermission', 'finished'].includes(phase)
      ? visibleIndices.indexOf(correctIndex) : undefined;

    if (isHost) {
      result.correctCount = answers.filter(a => a.selected_answer === question.correct_answer).length;
    } else {
      const originalAnswer = answers.find(a => a.player_id === session.id)?.selected_answer;
      result.myAnswer = originalAnswer === undefined ? null : visibleIndices.indexOf(originalAnswer);
    }
    return json(res, 200, result);
  } catch (e) { return error(res, e); }
}
