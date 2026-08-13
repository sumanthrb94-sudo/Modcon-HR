// Channel senders. Each returns an external reference used to thread the
// reply back to the check-in, or throws with a message worth logging.

import { requireEnv } from "./http.ts";
import type { Prompt } from "./schedule.ts";
import type { ProgressSource } from "./types.ts";

export interface Recipient {
  employee_id: string;
  email?: string | null;
  slack_user_id?: string | null;
  phone?: string | null;
  full_name?: string | null;
}

export interface SendContext {
  org_id: string;
  goal_id: string;
  goal_title: string;
  recipient: Recipient;
  prompt: Prompt;
}

export interface SendResult {
  external_ref: string | null;
}

/** Reply-to carries the goal id, so a plain reply routes itself. */
export function goalReplyAddress(goalId: string): string {
  const domain = requireEnv("UPDATES_EMAIL_DOMAIN");     // e.g. updates.modcon-hr.com
  return `goal+${goalId}@${domain}`;
}

async function sendEmail(ctx: SendContext): Promise<SendResult> {
  if (!ctx.recipient.email) throw new Error("employee has no email address");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: requireEnv("CHECKIN_FROM_EMAIL"),           // e.g. "ModCon HR <hr@modcon-hr.com>"
      reply_to: goalReplyAddress(ctx.goal_id),
      to: [ctx.recipient.email],
      subject: ctx.prompt.subject,
      text: ctx.prompt.body,
    }),
  });

  if (!res.ok) throw new Error(`Resend rejected the message (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return { external_ref: body.id ?? null };
}

async function sendChat(ctx: SendContext): Promise<SendResult> {
  if (!ctx.recipient.slack_user_id) throw new Error("employee has no slack_user_id");

  // DM the person: replies land in a thread the events adapter already watches.
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("SLACK_BOT_TOKEN")}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: ctx.recipient.slack_user_id,
      text: ctx.prompt.body,
      unfurl_links: false,
    }),
  });

  const body = await res.json();
  if (!body.ok) throw new Error(`Slack rejected the message: ${body.error}`);
  return { external_ref: `${body.channel}:${body.ts}` };
}

async function sendCall(ctx: SendContext): Promise<SendResult> {
  if (!ctx.recipient.phone) throw new Error("employee has no phone number");

  // The agent asks the three questions; the post-call webhook feeds ingest-voice.
  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      agent_id: requireEnv("CHECKIN_AGENT_ID"),
      agent_phone_number_id: requireEnv("CHECKIN_PHONE_NUMBER_ID"),
      to_number: ctx.recipient.phone,
      conversation_initiation_client_data: {
        dynamic_variables: {
          org_id: ctx.org_id,
          employee_id: ctx.recipient.employee_id,
          goal_id: ctx.goal_id,
          goal_title: ctx.goal_title,
          employee_name: ctx.recipient.full_name ?? "there",
          opening_line: ctx.prompt.body,
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Outbound call failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return { external_ref: body.conversation_id ?? body.callSid ?? null };
}

/**
 * The in-app rung sends nothing outward. The queued check-in row IS the nudge —
 * the goal card renders it. Deliberately first on the default ladder so the
 * gentlest ask happens before anyone's phone buzzes.
 */
function sendApp(): SendResult {
  return { external_ref: null };
}

export async function send(channel: ProgressSource, ctx: SendContext): Promise<SendResult> {
  switch (channel) {
    case "email": return await sendEmail(ctx);
    case "chat":  return await sendChat(ctx);
    case "call":  return await sendCall(ctx);
    case "app":   return sendApp();
    default:      throw new Error(`no sender for channel ${channel}`);
  }
}
