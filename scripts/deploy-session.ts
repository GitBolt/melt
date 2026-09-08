import { encodeDeployData } from "viem";
import {
  initialize,
  chain,
  operator,
  client,
  send,
  fixtureArtifact,
} from "../apps/api/src/chain.js";
import { setSetting } from "../apps/api/src/store.js";
if (
  !process.argv.includes("--confirm-testnet") ||
  !process.env.RPC_URL ||
  ![11155111, 84532].includes(Number(process.env.CHAIN_ID))
)
  throw Error(
    "This script only deploys the demo fixture on Sepolia or Base Sepolia. Configure .env, fund the Privy relayer, then pass --confirm-testnet.",
  );
await initialize();
console.log(`Fixture deployment uses relayer ${operator} on ${chain.name}.`);
const hash = await send({
  data: encodeDeployData({
    abi: fixtureArtifact.abi,
    bytecode: `0x${fixtureArtifact.evm.bytecode.object}`,
  }),
});
const receipt = await client.getTransactionReceipt({ hash });
setSetting(`fixture:${chain.id}`, receipt.contractAddress!);
console.log(
  `FIXTURE_CONTRACT=${receipt.contractAddress}\nTransaction=${hash}\nSet ENABLE_TEST_FIXTURES=true and restart the app.`,
);
