import { db, host, player, json, error } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json(res, 400, { error: 'Invalid code' });
  try {
    const s = db();
    const { data: room, error: re } = await s.from('game_rooms')
      .select('id,mode,status,game_phase,current_question_number,question_ends_at')
      .eq('room_code', code).maybeSingle();
    if (re) throw re;
    if (!room) return json(res, 404, { error: 'Room not found' });
    const isHost = host(req);
    const session = player(req);
    if (!isHost && (!session || session.room !== room.id)) return json(res, 401, { error: 'Join the room first' });
    const { data: players, error: pe } = await s.from('players')
      .select('id,name,score').eq('room_id', room.id).order('score', { ascending: false });
    if (pe) throw pe;
    const roundCount = room.mode === 'full' ? 6 : 3;
    const number = room.current_question_number || 0;
    const phase = room.game_phase || 'lobby';
    const result = {
      status: room.status, phase, mode: room.mode, number,
      round: number ? Math.ceil(number / 5) : 0,
      total: roundCount * 5, roundCount,
      endsAt: room.question_ends_at,
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
    result.question = question.question_text;
    result.category = question.category;
    result.choices = (isHost || phase !== 'question') ? question.choices : [];
    if (['reveal', 'leaderboard', 'intermission', 'finished'].includes(phase)) {
      result.correctAnswer = question.correct_answer;
    }
    if (isHost) {
      result.correctCount = answers.filter(a => a.selected_answer === question.correct_answer).length;
    } else {
      result.myAnswer = answers.find(a => a.player_id === session.id)?.selected_answer ?? null;
    }
    return json(res, 200, result);
  } catch (e) { return error(res, e); }
}
