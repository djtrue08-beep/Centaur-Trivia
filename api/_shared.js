import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const key=()=>process.env.SESSION_SECRET;
export const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export function json(res,status,data){res.status(status).setHeader('Cache-Control','no-store').json(data)}
export function body(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
export function cookie(req,name){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
export function sign(value){return crypto.createHmac('sha256',key()).update(value).digest('hex')}
export function host(req){const token=cookie(req,'centaur_host');if(!token)return false;const [expires,sig]=token.split('.');if(!expires||!sig||!/^\d+$/.test(expires)||Number(expires)<Date.now())return false;const expected=sign(expires);return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}
export function player(req){const token=cookie(req,'centaur_player');if(!token)return null;const [id,room,expires,sig]=token.split('.');if(!id||!room||!expires||!sig||Number(expires)<Date.now())return null;const expected=sign(`${id}.${room}.${expires}`);return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))?{id,room}:null;}
export function secureCookie(name,value,maxAge){return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`}
export function requirePost(req,res){if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return false}const origin=req.headers.origin;const host=req.headers.host;if(origin){try{if(new URL(origin).host!==host){json(res,403,{error:'Invalid origin'});return false}}catch{json(res,403,{error:'Invalid origin'});return false}}return true}
export function error(res,e){console.error('Centaur API error',e);json(res,500,{error:'Server error. Check Vercel runtime logs.'})}
