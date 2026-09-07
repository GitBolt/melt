import {db,list} from '../apps/api/src/store.js';
console.log(JSON.stringify(list().map(t=>({id:t.id,status:t.status,assets:t.assets,events:t.events.slice(-4)})),null,2));db.close();
