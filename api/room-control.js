import { db, host, json, body, requirePost, error } from './_shared.js';

// Consolidated route: one Vercel Hobby function for pause, replay and removal.
export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });

  const { operation, paused, playerId } = body(req);
  const code = String(body(req).code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code)) {
    return json(res, 400, { error: 'Invalid room code' });
  }
  if (!['pause', 'replay', 'remove'].includes(operation)) {
    return json(res, 400, { error: 'Invalid room operation' });
  }

  try {
    const supabase = db();
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, status, game_phase, is_paused, question_ends_at, pause_remaining_ms')
      .eq('room_code', code)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return json(res, 404, { error: 'Room not found' });

    if (operation === 'remove') {
      if (room.status !== 'waiting') {
        return json(res, 409, { error: 'Players can only be removed in the lobby' });
      }
      if (typeof playerId !== 'string' || !playerId) {
        return json(res, 400, { error: 'Player ID required' });
      }
      const { data: removed, error: removeError } = await supabase
        .from('players')
        .delete()
        .eq('room_id', room.id)
        .eq('id', playerId)
        .select('id');
      if (removeError) throw removeError;
      if (!removed?.length) return json(res, 404, { error: 'Player not found' });
      return json(res, 200, { ok: true, operation });
    }

    if (operation === 'pause') {
      if (room.status !== 'playing') {
        return json(res, 409, { error: 'No active game to pause' });
      }
      if (typeof paused !== 'boolean') {
        return json(res, 400, { error: 'Paused must be true or false' });
      }
      if (room.is_paused === paused) return json(res, 200, { ok: true, paused });
      const remaining = room.question_ends_at
        ? Math.max(0, Date.parse(room.question_ends_at) - Date.now())
        : null;
      const changes = paused
        ? { is_paused: true, pause_remaining_ms: remaining }
        : {
            is_paused: false,
            question_ends_at: room.question_ends_at && room.pause_remaining_ms !== null
              ? new Date(Date.now() + Math.max(0, room.pause_remaining_ms)).toISOString()
              : room.question_ends_at,
            pause_remaining_ms: null
          };
      const { error: updateError } = await supabase
        .from('game_rooms')
        .update(changes)
        .eq('id', room.id)
        .eq('is_paused', !paused);
      if (updateError) throw updateError;
      return json(res, 200, { ok: true, paused });
    }

    if (room.status !== 'finished') {
      return json(res, 409, { error: 'Finish the current game before replaying' });
    }
    // Clear game-specific records, but preserve the room and all player IDs/cookies.
    const { error: answerError } = await supabase
      .from('player_answers').delete().eq('room_id', room.id);
    if (answerError) throw answerError;
    const { error: questionError } = await supabase
      .from('game_questions').delete().eq('room_id', room.id);
    if (questionError) throw questionError;
    const { error: scoreError } = await supabase
      .from('players').update({ score: 0 }).eq('room_id', room.id);
    if (scoreError) throw scoreError;
    const { error: resetError } = await supabase
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
      .eq('status', 'finished');
    if (resetError) throw resetError;
    return json(res, 200, { ok: true, operation: 'replay', roomCode: code });
  } catch (exception) {
    return error(res, exception);
  }
}
