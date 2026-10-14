import {host,json} from './_shared.js';
export default function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});json(res,200,{authenticated:host(req)})}
