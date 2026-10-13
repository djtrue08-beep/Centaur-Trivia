import {json,secureCookie,requirePost} from './_shared.js';
export default function handler(req,res){if(!requirePost(req,res))return;res.setHeader('Set-Cookie',secureCookie('centaur_host','',0));json(res,200,{ok:true})}
