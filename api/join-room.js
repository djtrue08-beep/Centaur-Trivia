
import {
  db,
  json,
  body,
  requirePost,
  error,
  sign,
  secureCookie
} from './_shared.js';

export default async function handler(req, res) {

  // Only allow POST requests
  if (!requirePost(req, res)) {
    return;
  }

  // Get the room code and player name
  const requestBody = body(req);

  const roomCode = String(requestBody.code || '')
    .trim()
    .toUpperCase();

  const playerName = String(requestBody.name || '')
    .trim();

  // Validate the room code and player name
  if (
    !/^[A-HJ-NP-Z2-9]{4,6}$/.test(roomCode) ||
    playerName.length < 1 ||
    playerName.length > 24
  ) {
    return json(res, 400, {
      error: 'Enter a valid room code and name (1–24 characters)'
    });
  }

  try {

    // Connect to Supabase
    const supabase = db();

    // Find the room
    const {
      data: room,
      error: roomError
    } = await supabase
      .from('game_rooms')
      .select('id, status, room_code')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }

    if (!room || room.status !== 'waiting') {
      return json(res, 404, {
        error: 'Room not found or no longer accepting players'
      });
    }

    // Count the players currently in the room
    const {
      count,
      error: countError
    } = await supabase
      .from('players')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('room_id', room.id);

    if (countError) {
      throw countError;
    }

    // Maximum of 60 players
    if (count >= 60) {
      return json(res, 409, {
        error: 'This lobby is full'
      });
    }

    // Check whether the name is already taken
    const {
      data: existingPlayers,
      error: existingError
    } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id)
      .ilike('name', playerName);

    if (existingError) {
      throw existingError;
    }

    if (existingPlayers.length > 0) {
      return json(res, 409, {
        error: 'That name is already taken in this room'
      });
    }

    // Add the player to the room
    const {
      data: newPlayer,
      error: playerError
    } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        name: playerName,
        score: 0
      })
      .select('id, name')
      .single();

    if (playerError) {
      throw playerError;
    }

    // Create a secure player session
    const expires = Date.now() + 6 * 3600 * 1000;

    const sessionData =
      `${newPlayer.id}.${room.id}.${expires}`;

    const signature = sign(sessionData);

    res.setHeader(
      'Set-Cookie',
      secureCookie(
        'centaur_player',
        `${sessionData}.${signature}`,
        6 * 3600
      )
    );

    // Confirm the player joined successfully
    return json(res, 200, {
      ok: true,
      roomCode: roomCode,
      playerName: newPlayer.name
    });

  } catch (err) {

    console.error('Join room failed:', err);

    return error(res, err);
  }
}
