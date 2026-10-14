import pauseGame from '../server-handlers/pause-game.js';
import replayRoom from '../server-handlers/replay-room.js';
import removePlayer from '../server-handlers/remove-player.js';
import { json, body, requirePost } from './_shared.js';

// One Vercel serverless function handles three authenticated room controls.
export default async function handler(req, res) {
  if (!requirePost(req, res)) return;

  const { operation } = body(req);
  const handlers = {
    pause: pauseGame,
    replay: replayRoom,
    remove: removePlayer
  };
  const selected = handlers[operation];

  if (!selected) {
    return json(res, 400, { error: 'Invalid room operation' });
  }

  return selected(req, res);
}
