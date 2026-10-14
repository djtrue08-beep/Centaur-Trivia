import { db, host, json, body, requirePost, error } from './_shared.js';

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  if (!host(req)) return json(res, 401, { error: 'Host login required' });

  const { code: rawCode, playerId } = body(req);
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code) || !playerId) {
    return json(res, 400, { error: 'Invalid player removal request' });
  }

  try {
    const supabase = db();
    const { data: room, error: roomError } = await supabase
      .from('game_rooms')
      .select('id, status')
      .eq('room_code', code)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room || room.status !== 'waiting') {
      return json(res, 409, { error: 'Players can only be removed in the lobby' });
    }

    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId)
      .eq('room_id', room.id);
    if (deleteError) throw deleteError;
    return json(res, 200, { ok: true });
  } catch (err) {
    return error(res, err);
  }
}
