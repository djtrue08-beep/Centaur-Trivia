import crypto from 'node:crypto';
import {db,host,json,body,requirePost,error} from './_shared.js';
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(){return Array.from(crypto.randomBytes(6),b=>chars[b%chars.length]).join('')}
export default async function handler(req,res){if(!requirePost(req,res))return;if(!host(req))return json(res,401,{error:'Host login required'});const mode=body(req).mode;if(!['quick','full'].includes(mode))return json(res,400,{error:'Invalid mode'});try{const supabase=db();for(let i=0;i<5;i++){const roomCode=code();const {data,error:e}=await supabase.from('game_rooms')..insert({room_code:roomCode,mode:mode,status:'waiting'}).select('id,room_code,status').single();if(!e)return json(res,200,{...data,mode});if(e.code!=='23505')throw e}return json(res,503,{error:'Could not allocate room code'})}catch(e){error(res,e)}}
