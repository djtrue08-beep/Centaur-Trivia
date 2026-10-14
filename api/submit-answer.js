import { db, player, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const session = player(req);
  if (!session) return json(res, 401, { error: 'Join the room first' });
  const choice = body(req).choice;
  if (!Number.isInteger(choice) || choice < 0 || choice > 4)
    return json(res, 400, { error: 'Invalid answer' });
  try {
    const s = db();
    const { data: room, error: re } = await s.from('game_rooms')
      .select('id,status,game_phase,current_question_number,question_ends_at,is_paused')
      .eq('id', session.room).maybeSingle();
    if (re) throw re;
    if (!room || room.status !== 'playing' || room.game_phase !== 'answering' || room.is_paused ||
        !room.question_ends_at || Date.now() >= Date.parse(room.question_ends_at))
      return json(res, 409, { error: 'Answer window is closed' });
    const { data: member, error: me } = await s.from('players')
      .select('id').eq('id', session.id).eq('room_id', room.id).maybeSingle();
    if (me) throw me;
    if (!member) return json(res, 403, { error: 'Player not in room' });
    const { data: assigned, error: ae } = await s.from('game_questions')
      .select('question_id').eq('room_id', room.id)
      .eq('question_number', room.current_question_number).maybeSingle();
    if (ae) throw ae;
    if (!assigned) return json(res, 409, { error: 'No active question' });
    const { error: ie } = await s.from('player_answers').insert({
      room_id: room.id, player_id: session.id,
      question_id: assigned.question_id, selected_answer: choice
    });
    if (ie?.code === '23505') return json(res, 409, { error: 'Answer already locked' });
    if (ie) throw ie;
    return json(res, 200, { ok: true, message: 'Answer locked!' });
  } catch (e) { return error(res, e); }
}
