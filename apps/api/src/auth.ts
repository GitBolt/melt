import type { FastifyRequest } from "fastify";
import { privy, local, demoOwner } from "./chain.js";
import { db, digest } from "./store.js";
import { createWalletLookup } from "./auth-wallet-cache.js";
const profileForUser = createWalletLookup(async (id) => {
  const user = await privy!.users()._get(id);
  const wallet = user.linked_accounts.find(
    (a: any) => a.type === "wallet" && a.chain_type === "ethereum",
  ) as any;
  if (!wallet) throw Error("Add an Ethereum wallet to your account");
  const emails = user.linked_accounts.flatMap((account: any) => {
    const email =
      account.type === "email"
        ? account.address
        : ["google_oauth", "apple_oauth"].includes(account.type)
          ? account.email
          : undefined;
    return typeof email === "string" ? [email.trim().toLowerCase()] : [];
  });
  return { owner: wallet.address as string, emails };
});
export interface Identity {
  id: string;
  owner: string;
  emails?: string[];
  apiKey: boolean;
  tokenHash?: string;
}
export async function authenticate(req: FastifyRequest): Promise<Identity> {
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  if (bearer?.startsWith("melt_")) {
    const tokenHash = digest(bearer);
    const row = db
      .prepare("SELECT user_id FROM tokens WHERE hash=? AND revoked=0")
      .get(tokenHash);
    if (row)
      return {
        id: row.user_id as string,
        ...(privy
          ? await profileForUser(row.user_id as string)
          : { owner: "" }),
        apiKey: true,
        tokenHash,
      };
    throw Object.assign(Error("API key is invalid or revoked"), {
      statusCode: 401,
    });
  }
  if (bearer && privy) {
    try {
      const verified = await privy.utils().auth().verifyAccessToken(bearer);
      const profile = await profileForUser(verified.user_id);
      return { id: verified.user_id, ...profile, apiKey: false };
    } catch {
      throw Object.assign(Error("Sign in again to continue"), {
        statusCode: 401,
      });
    }
  }
  const token = (req.cookies as Record<string, string>).melt_session;
  if (local && token) {
    const row = db
      .prepare("SELECT * FROM auth_sessions WHERE hash=? AND expires>?")
      .get(digest(token), Date.now());
    if (row)
      return {
        id: row.user_id as string,
        owner: row.owner as string,
        apiKey: false,
      };
  }
  throw Object.assign(Error("Sign in to continue"), { statusCode: 401 });
}
