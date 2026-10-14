
import {
  db,
  host,
  player,
  json,
  error
} from './_shared.js';

export default async function handler(req, res) {

  // Only allow GET requests
  if (req.method !== 'GET') {
    return json(res, 405, {
      error: 'Method not allowed'
    });
  }

  // Read and validate the room code
  const code = String(req.query.code || '')
    .toUpperCase();

  if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(code)) {
    return json(res, 400, {
      error: 'Invalid room code'
    });
  }

  try {

    // Connect to Supabase
    const supabase = db();

    // Find the game room
    const {
      data: room,
      error: roomError
    } = await supabase
      .from('game_rooms')
      .select('id, room_code, status')
      .eq('room_code', code)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }

    if (!room) {
      return json(res, 404, {
        error: 'Room not found'
      });
    }

    // Check host or player authorization
    const isHost = host(req);
    const currentPlayer = player(req);

    if (
      !isHost &&
      (!currentPlayer || currentPlayer.room !== room.id)
    ) {
      return json(res, 401, {
        error: 'Join the room first'
      });
    }

    // Retrieve players from Supabase
    const {
      data: players,
      error: playersError
    } = await supabase
      .from('players')
      .select('id, name, joined_at')
      .eq('room_id', room.id)
      .order('joined_at', {
        ascending: true
      })
      .limit(60);

    if (playersError) {
      throw playersError;
    }

    // Removed players must no longer be treated as connected participants.
    if (!isHost && !players.some(current => current.id === currentPlayer.id)) {
      return json(res, 403, { error: 'You were removed from this room' });
    }

    // Send updated lobby information
    return json(res, 200, {
      roomCode: code,
      status: room.status,
      players: players.map(
        current => current.name
      ),
      members: isHost ? players.map(current => ({ id: current.id, name: current.name })) : undefined,
      count: players.length
    });

  } catch (err) {

    console.error('Room state failed:', err);

    return error(res, err);
  }
}
