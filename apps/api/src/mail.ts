import { appOrigin } from "./receipt.js";
import type { Envelope } from "../../../packages/shared/src/index.js";

const FROM_NAME = process.env.MAIL_FROM_NAME || "Melt";
const FROM_EMAIL = process.env.MAIL_FROM || "boltdoesthis@gmail.com";

export function mailConfigured() {
  return !!(process.env.MAIL_WEBHOOK && process.env.MAIL_SECRET);
}

export function giftUrl(token?: string) {
  return token ? `${appOrigin()}/g/${token}` : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dollars(envelope: Envelope, rate?: number) {
  const n = Number(envelope.budget) * (rate || 0);
  if (rate && Number.isFinite(n) && n > 0)
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n >= 10 ? 0 : 2,
    });
  return `${envelope.budget} ETH`;
}

function until(envelope: Envelope) {
  return new Date(envelope.expiresAt * 1000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function wrap(inner: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f5f8;padding:28px 12px;font-family:ui-sans-serif,system-ui,sans-serif;color:#282a32;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e4e7ef;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;font-size:13px;letter-spacing:.12em;color:#8c90a0;">MELT</td></tr>
        ${inner}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function giftEmail(
  kind: "sent" | "ready" | "spent",
  envelope: Envelope,
  rate?: number,
) {
  const from = envelope.senderName || "Someone";
  const amount = dollars(envelope, rate);
  const link = giftUrl(envelope.receiptToken);
  const purpose = envelope.purpose;
  const note = envelope.note?.trim();
  const titles = {
    sent: `${purpose.split(",")[0]}, from ${from}`,
    ready: `${from} funded dinner money you can actually use`,
    spent: `${from}'s gift just bought ${envelope.redemptions.at(-1)?.title || "something"}`,
  };
  if (kind === "ready")
    titles.ready = `${from} funded this. You can spend it now.`;
  const lead =
    kind === "sent"
      ? `${from} set aside ${amount} for you.`
      : kind === "ready"
        ? `The envelope is funded. ${amount} is waiting.`
        : `Melt settled a purchase that still matches the promise.`;
  const html = wrap(`
    <tr><td style="padding:8px 32px 6px;font-size:28px;letter-spacing:-1px;font-weight:600;line-height:1.2;">${escapeHtml(purpose)}</td></tr>
    <tr><td style="padding:0 32px 18px;font-size:16px;color:#4c5161;line-height:1.55;">${escapeHtml(lead)}</td></tr>
    ${
      note
        ? `<tr><td style="padding:0 32px 18px;font-size:15px;color:#282a32;font-style:italic;">“${escapeHtml(note)}”</td></tr>`
        : ""
    }
    <tr><td style="padding:0 32px 8px;font-size:13px;color:#8c90a0;">Up to ${escapeHtml(amount)} · use by ${escapeHtml(until(envelope))}</td></tr>
    <tr><td style="padding:18px 32px 32px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#5867c8;color:#fff;text-decoration:none;border-radius:10px;padding:12px 18px;font-size:14px;">Open the envelope</a>
    </td></tr>
  `);
  return {
    subject: titles[kind],
    text: `${purpose}\n\n${lead}\n${note ? `\n${note}\n` : ""}\nOpen it: ${link}`,
    html,
    fromName: FROM_NAME,
  };
}

async function postJson(url: string, payload: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "manual",
    body: JSON.stringify(payload),
  });
}

export async function sendMail(
  to: string,
  message: { subject: string; text: string; html: string; fromName?: string },
) {
  if (!mailConfigured())
    return { sent: false, reason: "Mail is not configured" };
  const webhook = process.env.MAIL_WEBHOOK!;
  const payload = {
    secret: process.env.MAIL_SECRET,
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    fromName: message.fromName || FROM_NAME,
    from: FROM_EMAIL,
  };
  const posted = await postJson(webhook, payload);
  const location = posted.headers.get("location");
  const response =
    posted.status >= 300 && posted.status < 400 && location
      ? await fetch(location, { redirect: "follow" })
      : posted.type === "opaqueredirect"
        ? await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow",
            body: JSON.stringify(payload),
          })
        : posted;
  const body = await response.text();
  if (!response.ok || body.trim() !== "ok")
    throw Error(body.trim() || "Gift email did not send");
  return { sent: true as const };
}
