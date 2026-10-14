
import crypto from 'node:crypto';
import {
  db,
  host,
  json,
  body,
  requirePost,
  error
} from './_shared.js';

const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  // Require at least one letter and one number in every new room code.
  let code;
  do {
    code = Array.from(
      crypto.randomBytes(4),
      byte => characters[byte % characters.length]
    ).join('');
  } while (!/[A-Z]/.test(code) || !/[2-9]/.test(code));
  return code;
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) {
    return;
  }

  if (!host(req)) {
    return json(res, 401, {
      error: 'Host login required'
    });
  }

  const requestBody = body(req);
  const mode = requestBody.mode;

  if (!['quick', 'full'].includes(mode)) {
    return json(res, 400, {
      error: 'Invalid game mode'
    });
  }

  try {
    const supabase = db();

    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = generateRoomCode();

      const { data, error: databaseError } = await supabase
        .from('game_rooms')
        .insert({
          room_code: roomCode,
          mode: mode,
          status: 'waiting'
        })
        .select('id, room_code, mode, status')
        .single();

      if (!databaseError) {
        return json(res, 200, data);
      }

      if (databaseError.code !== '23505') {
        throw databaseError;
      }
    }

    return json(res, 503, {
      error: 'Could not generate a unique room code'
    });
  } catch (err) {
    console.error('Create room failed:', err);
    return error(res, err);
  }
}
