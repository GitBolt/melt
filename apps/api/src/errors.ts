import { z } from "zod";
/** Provider errors can include credential-bearing RPC URLs; never persist or display them. */
export function errorMessage(error: unknown) {
  let message =
    error instanceof z.ZodError
      ? error.issues
          .map(
            (issue) => `${issue.path.join(".") || "Request"}: ${issue.message}`,
          )
          .join("; ")
      : error instanceof Error
        ? error.message
        : "Request failed";
  for (const name of [
    "PRIVY_APP_SECRET",
    "AI_API_KEY",
    "UNISWAP_API_KEY",
    "RPC_URL",
  ]) {
    const value = process.env[name];
    if (value && value.length > 6)
      message = message.split(value).join("[redacted]");
  }
  return message.split("\n")[0].slice(0, 500);
}
