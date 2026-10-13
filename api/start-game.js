
import crypto from 'node:crypto';

import {
  db,
  host,
  json,
  body,
  requirePost,
  error
} from './_shared.js';

const QUESTIONS_PER_ROUND = 5;

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);

    [result[i], result[j]] = [
      result[j],
      result[i]
    ];
  }

  return result;
}

function selectQuestions(questionBank, roundCount) {
  const available = shuffle(questionBank);
  const selected = [];

  for (let round = 1; round <= roundCount; round++) {
    const progress = (round - 1) / Math.max(1, roundCount - 1);

    const preferredDifficulty =
      progress < 0.34 ? 1 :
      progress < 0.67 ? 2 : 3;

    for (let position = 1; position <= QUESTIONS_PER_ROUND; position++) {
      let index = available.findIndex(
        question => question.difficulty === preferredDifficulty
      );

      if (index === -1) {
        index = 0;
      }

      if (index >= available.length) {
        throw new Error('Not enough questions available');
      }

      const [question] = available.splice(index, 1);

      selected.push({
        question_id: question.id,
        round_number: round,
        question_number:
          (round - 1) * QUESTIONS_PER_ROUND + position
      });
    }
  }

  return selected;
}

export default async function handler(req, res) {

  // Accept POST requests only
  if (!requirePost(req, res)) {
    return;
  }

  // Verify the host session
  if (!host(req)) {
    return json(res, 401, {
      error: 'Host login required'
    });
  }

  const requestBody = body(req);

  const roomCode = String(requestBody.code || '')
    .trim()
    .toUpperCase();

  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) {
    return json(res, 400, {
      error: 'Invalid room code'
    });
  }

  try {
    const supabase = db();

    // Find the game room and its mode
    const {
      data: room,
      error: roomError
    } = await supabase
      .from('game_rooms')
      .select('id, status, mode')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }

    if (!room || room.status !== 'waiting') {
      return json(res, 409, {
        error: 'Room is not waiting'
      });
    }

    if (!['quick', 'full'].includes(room.mode)) {
      return json(res, 400, {
        error: 'Invalid game mode'
      });
    }

    // Require at least one player
    const {
      count: playerCount,
      error: playerError
    } = await supabase
      .from('players')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('room_id', room.id);

    if (playerError) {
      throw playerError;
    }

    if (!playerCount) {
      return json(res, 409, {
        error: 'Wait for at least one player'
      });
    }

    // Determine the game length
    const roundCount = room.mode === 'quick' ? 3 : 6;

    const totalQuestions =
      roundCount * QUESTIONS_PER_ROUND;

    // Retrieve the question bank
    const {
      data: questionBank,
      error: questionError
    } = await supabase
      .from('questions')
      .select('id, difficulty')
      .limit(1000);

    if (questionError) {
      throw questionError;
    }

    if (!questionBank || questionBank.length < totalQuestions) {
      return json(res, 503, {
        error: 'Not enough trivia questions available'
      });
    }

    // Randomly select and organize questions
    const selectedQuestions = selectQuestions(
      questionBank,
      roundCount
    );

    const assignments = selectedQuestions.map(
      question => ({
        room_id: room.id,
        ...question
      })
    );

    // Save this game's question assignments
    const {
      error: assignmentError
    } = await supabase
      .from('game_questions')
      .insert(assignments);

    if (assignmentError) {
      throw assignmentError;
    }

    // Mark the game as playing
    const {
      data: startedRoom,
      error: startError
    } = await supabase
      .from('game_rooms')
      .update({
        status: 'playing'
      })
      .eq('id', room.id)
      .eq('status', 'waiting')
      .select('id')
      .maybeSingle();

    if (startError || !startedRoom) {

      // Clean up assignments if starting fails
      const {
        error: cleanupError
      } = await supabase
        .from('game_questions')
        .delete()
        .eq('room_id', room.id);

      if (cleanupError) {
        console.error(
          'Question cleanup failed:',
          cleanupError
        );
      }

      if (startError) {
        throw startError;
      }

      return json(res, 409, {
        error: 'Room could not be started'
      });
    }

    return json(res, 200, {
      ok: true,
      mode: room.mode,
      rounds: roundCount,
      questionCount: totalQuestions,
      message: 'Trivia questions assigned successfully'
    });

  } catch (err) {
    console.error('Start game failed:', err);

    return error(res, err);
  }
}
