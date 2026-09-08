import Fastify, { type FastifyInstance } from "fastify";
import { toFunctionSelector } from "viem";
import { fixture, tipJar, chain } from "./chain.js";
export function registerFixtures(app: FastifyInstance, prefix = "") {
  app.get(prefix + "/health", () => ({ ok: true }));
  for (const path of ["/studio", "/print-shop", "/guardrail-check"])
    app.get(prefix + path, async (_q, r) =>
      r.type("text/html")
        .send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${path === "/studio" ? "Field Notes Studio" : "Sunday Print Shop"}</title><style>*{box-sizing:border-box}body{margin:0;background:${path === "/studio" ? "#f7f7f3" : "#edf1f6"};color:#35363e;font:16px system-ui}header{padding:32px 48px;display:flex;justify-content:space-between}main{max-width:900px;margin:32px auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}.art{height:410px;background:#dfe5ee;border:16px solid #fff;box-shadow:0 15px 50px #1f293b12;display:grid;place-items:center;overflow:hidden}.petal{width:190px;height:230px;background:#b0bbd5;border-radius:90px 90px 14px 14px;transform:rotate(-16deg);box-shadow:40px -20px 0 #f4f2ee,80px 0 0 #8b9fbb}h1{font-weight:500;font-size:48px;letter-spacing:-2px}p{color:#747783;line-height:1.7}button{border:0;border-radius:9px;background:#424a64;color:#fff;padding:13px 22px;font:inherit;cursor:pointer}button:disabled{opacity:.4}#status{margin-top:20px;max-width:350px}small{display:block;margin:25px 0;color:#7e828e}@media(max-width:650px){main{display:block;margin:24px}.art{height:240px}header{padding:20px}}</style><header><b>${path === "/studio" ? "field notes" : "sunday print shop"}</b><button id="connect">Connect wallet</button></header><main><div class="art"><div class="petal"></div></div><section><small>TESTNET EDITION · ${chain.name}</small><h1>Something<br>to take home.</h1><p>A small digital field note.<br>Minted to your connected wallet.</p><small>0.0001 ${chain.nativeCurrency.symbol} · one per mint</small><button id="mint" disabled>Mint field note</button><p id="status" role="status">Connect your wallet to begin.</p></section></main><script>
const status=document.getElementById('status'),connect=document.getElementById('connect'),mint=document.getElementById('mint');let account;
connect.onclick=async()=>{try{[account]=await window.ethereum.request({method:'eth_requestAccounts'});if(!account)throw Error('No account available');connect.textContent=account.slice(0,6)+'…'+account.slice(-4);mint.disabled=false;status.textContent='Wallet connected.';}catch(e){status.textContent=e.message;}};
mint.onclick=async()=>{mint.disabled=true;status.textContent='Waiting for confirmation…';try{${path === "/guardrail-check" ? "try{await window.ethereum.request({method:'eth_sendTransaction',params:[{from:account,to:'" + fixture + "',data:'0x1249c58b',value:'0xde0b6b3a7640000'}]});throw Error('Guardrail failed');}catch(e){if(e.message==='Guardrail failed')throw e;}" : ""}const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[{from:account,to:'${fixture}',data:'0x1249c58b',value:'0x5af3107a4000',chainId:'0x${chain.id.toString(16)}'}]});status.textContent='Field note minted. Transaction '+hash;mint.textContent='Minted';}catch(e){status.textContent=e.message;mint.disabled=false;}};
</script></html>`),
    );
  app.get(prefix + "/kiosk", async (_q, r) =>
    r.type("text/html")
      .send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Corner kiosk</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#35363e;font:16px system-ui}header{padding:32px 48px;display:flex;justify-content:space-between}main{max-width:640px;margin:48px auto;padding:0 24px}h1{font-weight:500;font-size:44px;letter-spacing:-2px}p{color:#747783;line-height:1.7}button{border:0;border-radius:9px;background:#424a64;color:#fff;padding:13px 22px;font:inherit;cursor:pointer}button:disabled{opacity:.4}#status{margin-top:20px}small{display:block;margin:25px 0;color:#7e828e}</style><header><b>corner kiosk</b><button id="connect">Connect wallet</button></header><main><small>TESTNET EDITION · ${chain.name}</small><h1>Leave a tip.</h1><p>Pay the kiosk from the connected task wallet. Unused funds still return when the session ends.</p><small>0.0001 ${chain.nativeCurrency.symbol}</small><button id="pay" disabled>Leave a tip</button><p id="status" role="status">Connect your wallet to begin.</p></main><script>
const status=document.getElementById('status'),connect=document.getElementById('connect'),pay=document.getElementById('pay');let account;
connect.onclick=async()=>{try{[account]=await window.ethereum.request({method:'eth_requestAccounts'});if(!account)throw Error('No account available');connect.textContent=account.slice(0,6)+'…'+account.slice(-4);pay.disabled=false;status.textContent='Wallet connected.';}catch(e){status.textContent=e.message;}};
pay.onclick=async()=>{pay.disabled=true;status.textContent='Waiting for confirmation…';try{const hash=await window.ethereum.request({method:'eth_sendTransaction',params:[{from:account,to:'${tipJar}',data:'${toFunctionSelector("tip()")}',value:'0x5af3107a4000',chainId:'0x${chain.id.toString(16)}'}]});status.textContent='Tip received. Transaction '+hash;pay.textContent='Paid';}catch(e){status.textContent=e.message;pay.disabled=false;}};
</script></html>`),
  );
  app.get(prefix + "/start", async (_q, r) =>
    r
      .type("text/html")
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start the task</title><style>*{box-sizing:border-box}body{margin:0;background:#fafafa;color:#35363e;font:16px system-ui}main{max-width:560px;margin:72px auto;padding:0 24px}h1{font-weight:500;font-size:36px;letter-spacing:-1.5px}p{color:#747783;line-height:1.7}label{display:block;margin:24px 0 12px;font-size:13px}input{width:100%;padding:12px 14px;border:1px solid #d7dbe7;border-radius:10px;font:inherit}button{margin-top:16px;border:0;border-radius:9px;background:#424a64;color:#fff;padding:13px 22px;font:inherit;cursor:pointer}</style><main><h1>Open a website</h1><p>This session can spend only the limit you set. Enter the site for the job.</p><label>Website<input id="url" type="url" placeholder="https://"></label><button id="go">Open site</button></main><script>document.getElementById('go').onclick=()=>{const v=document.getElementById('url').value.trim();if(v)location.href=v;}</script></html>`,
      ),
  );
}
export async function startFixtures() {
  const app = Fastify({ logger: false });
  registerFixtures(app);
  await app.listen({
    host: "127.0.0.1",
    port: Number(process.env.FIXTURE_PORT || 8788),
  });
  return app;
}
