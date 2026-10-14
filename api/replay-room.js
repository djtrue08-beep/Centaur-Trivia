import { db, host, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });

  const code = String(body(req).code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code)) {
    return json(res, 400, { error: 'Invalid room code' });
  }

  try {
    const supabase = db();
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, status, game_phase')
      .eq('room_code', code)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room || room.status !== 'finished' || room.game_phase !== 'finished') {
      return json(res, 409, { error: 'Finish the game before replaying' });
    }

    // Clear answers before assignments. Player rows and room ID remain unchanged,
    // preserving existing phone sessions and the original room code.
    const { error: answersError } = await supabase
      .from('player_answers')
      .delete()
      .eq('room_id', room.id);
    if (answersError) throw answersError;

    const { error: assignmentsError } = await supabase
      .from('game_questions')
      .delete()
      .eq('room_id', room.id);
    if (assignmentsError) throw assignmentsError;

    const { error: scoresError } = await supabase
      .from('players')
      .update({ score: 0 })
      .eq('room_id', room.id);
    if (scoresError) throw scoresError;

    const { data: updated, error: updateError } = await supabase
      .from('game_rooms')
      .update({
        status: 'waiting',
        game_phase: 'lobby',
        current_question_number: 0,
        question_started_at: null,
        question_ends_at: null,
        is_paused: false,
        pause_remaining_ms: null
      })
      .eq('id', room.id)
      .eq('status', 'finished')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json(res, 409, { error: 'Room changed while resetting' });

    return json(res, 200, { ok: true, roomCode: code });
  } catch (err) {
    console.error('Replay room failed:', err);
    return error(res, err);
  }
}
