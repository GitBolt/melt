import {db,list,digest} from '../apps/api/src/store.js';
import {randomBytes} from 'node:crypto';
const t=list().find(t=>t.status==='paused');if(t){const token='melt_'+randomBytes(32).toString('hex');db.prepare('INSERT INTO tokens(hash,user_id,name,created) VALUES(?,?,?,?)').run(digest(token),t.userId,'Temporary test inspector',new Date().toISOString());const r=await fetch(`http://127.0.0.1:8787/api/sessions/${t.id}/browser`,{headers:{Authorization:`Bearer ${token}`}});console.log(await r.text());db.prepare('DELETE FROM tokens WHERE hash=?').run(digest(token));}db.close();
