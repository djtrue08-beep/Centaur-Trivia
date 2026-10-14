import { db, host, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });
  const code = String(body(req).code || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code)) return json(res, 400, { error: 'Invalid room code' });
  try {
    const s = db();
    const { data: room, error: re } = await s.from('game_rooms')
      .select('id,status,game_phase,is_paused').eq('room_code', code).maybeSingle();
    if (re) throw re;
    if (!room || room.status !== 'playing' || (room.game_phase !== 'question' || room.is_paused))
      return json(res, 409, { error: 'Question is not ready' });
    const now = Date.now();
    const { data, error: ue } = await s.from('game_rooms').update({
      game_phase: 'answering',
      question_started_at: new Date(now).toISOString(),
      question_ends_at: new Date(now + 12000).toISOString()
    }).eq('id', room.id).eq('game_phase', 'question').select('id').maybeSingle();
    if (ue) throw ue;
    if (!data) return json(res, 409, { error: 'Timer already started' });
    return json(res, 200, { ok: true });
  } catch (e) { return error(res, e); }
}
