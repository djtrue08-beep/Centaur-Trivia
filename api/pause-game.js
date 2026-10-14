import { db, host, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });
  const { code: rawCode, paused } = body(req);
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || typeof paused !== 'boolean') {
    return json(res, 400, { error: 'Invalid pause request' });
  }
  try {
    const s = db();
    const { data: room, error: readError } = await s.from('game_rooms')
      .select('id,status,game_phase,is_paused,question_ends_at,pause_remaining_ms')
      .eq('room_code', code).maybeSingle();
    if (readError) throw readError;
    if (!room || room.status !== 'playing') return json(res, 409, { error: 'Game is not playing' });
    if (room.is_paused === paused) return json(res, 200, { ok: true, paused });
    const update = { is_paused: paused };
    if (paused) {
      update.pause_remaining_ms = room.game_phase === 'answering' && room.question_ends_at
        ? Math.max(0, Date.parse(room.question_ends_at) - Date.now()) : null;
    } else {
      update.question_ends_at = room.game_phase === 'answering' && room.pause_remaining_ms !== null
        ? new Date(Date.now() + room.pause_remaining_ms).toISOString() : room.question_ends_at;
      update.pause_remaining_ms = null;
    }
    const { data: changed, error: updateError } = await s.from('game_rooms')
      .update(update).eq('id', room.id).eq('is_paused', !paused).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!changed) return json(res, 409, { error: 'Pause state changed; try again' });
    return json(res, 200, { ok: true, paused });
  } catch (e) { return error(res, e); }
}
