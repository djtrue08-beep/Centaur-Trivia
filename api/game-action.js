import { db, host, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });
  const { code: rawCode, action } = body(req);
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json(res, 400, { error: 'Invalid code' });
  if (!['finish', 'next'].includes(action)) return json(res, 400, { error: 'Invalid action' });
  try {
    const s = db();
    const { data: room, error: re } = await s.from('game_rooms')
      .select('id,status,mode,game_phase,current_question_number,question_ends_at')
      .eq('room_code', code).maybeSingle();
    if (re) throw re;
    if (!room || room.status !== 'playing') return json(res, 409, { error: 'Game is not playing' });
    const number = room.current_question_number;
    const total = room.mode === 'full' ? 31 : 16;
    if (action === 'finish') {
      if (room.game_phase !== 'answering') return json(res, 409, { error: 'Answers are not open' });
      const { data: assigned, error: ae } = await s.from('game_questions')
        .select('question_id').eq('room_id', room.id).eq('question_number', number).single();
      if (ae) throw ae;
      const { data: question, error: qe } = await s.from('questions')
        .select('correct_answer').eq('id', assigned.question_id).single();
      if (qe) throw qe;
      const { data: answers, error: ansError } = await s.from('player_answers')
        .select('player_id,selected_answer').eq('room_id', room.id).eq('question_id', assigned.question_id);
      if (ansError) throw ansError;
      const { count, error: ce } = await s.from('players')
        .select('id', { count: 'exact', head: true }).eq('room_id', room.id);
      if (ce) throw ce;
      if (Date.now() < Date.parse(room.question_ends_at) && answers.length < count)
        return json(res, 409, { error: 'Timer still running' });
      // Claim this reveal once, preventing duplicate scoring on repeat requests.
      const { data: claimed, error: ue } = await s.from('game_rooms')
        .update({ game_phase: 'reveal', question_ends_at: new Date().toISOString() }).eq('id', room.id)
        .eq('game_phase', 'answering').eq('current_question_number', number)
        .select('id').maybeSingle();
      if (ue) throw ue;
      if (!claimed) return json(res, 409, { error: 'Already revealed' });
      const points = number === total ? 500 : (
        room.mode === 'full'
          ? [100, 100, 200, 200, 300, 300][Math.floor((number - 1) / 5)]
          : [100, 200, 300][Math.floor((number - 1) / 5)]
      );
      const correct = answers.filter(a => a.selected_answer === question.correct_answer);
      if (correct.length) {
        const ids = correct.map(a => a.player_id);
        const { data: winners, error: we } = await s.from('players')
          .select('id,score').eq('room_id', room.id).in('id', ids);
        if (we) throw we;
        for (const winner of winners) {
          const { error: se } = await s.from('players')
            .update({ score: (winner.score || 0) + points })
            .eq('id', winner.id).eq('room_id', room.id);
          if (se) throw se;
        }
      }
      return json(res, 200, { ok: true, correctCount: correct.length, points });
    }
    const phase = room.game_phase;
    if (!['reveal', 'leaderboard', 'intermission'].includes(phase))
      return json(res, 409, { error: 'Cannot advance from this phase' });
    let nextPhase;
    let nextNumber = number;
    let finished = false;
    if (phase === 'reveal') {
      if (number === total) { nextPhase = 'finished'; finished = true; }
      else if (number % 5 === 0) nextPhase = 'leaderboard';
      else { nextPhase = 'question'; nextNumber++; }
    } else if (phase === 'leaderboard') {
      if (room.mode === 'full' && number === 15) nextPhase = 'intermission';
      else { nextPhase = 'question'; nextNumber++; }
    } else {
      nextPhase = 'question'; nextNumber++;
    }
    const { data: updated, error: ue } = await s.from('game_rooms')
      .update({
        game_phase: nextPhase,
        status: finished ? 'finished' : 'playing',
        current_question_number: nextNumber,
        question_started_at: null,
        question_ends_at: ['leaderboard', 'reveal'].includes(nextPhase) ? new Date().toISOString() : null
      }).eq('id', room.id).eq('game_phase', phase)
      .eq('current_question_number', number).select('id').maybeSingle();
    if (ue) throw ue;
    if (!updated) return json(res, 409, { error: 'Game already advanced' });
    return json(res, 200, { ok: true, phase: nextPhase });
  } catch (e) { return error(res, e); }
}
