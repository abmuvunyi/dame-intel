import { Injectable } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

// Pluggable transactional email — real delivery via Resend's HTTP API (a single
// POST call, no SDK dependency needed) when RESEND_API_KEY is configured; falls back
// to logging the would-be email to the console otherwise. Same graceful-fallback
// shape as StripeService and main.ts's Redis adapter — no real email provider
// credentials were available in this dev environment (see STATUS.md's Phase 13
// section), so every email this app "sends" during development and in this phase's
// test/verification runs lands in the console, not an inbox.
@Injectable()
export class EmailService {
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly fromAddress = process.env.RESEND_FROM_EMAIL || 'notifications@dame-intel.example';

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.apiKey) {
      console.log(`[Email:console-fallback] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
      return;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!res.ok) {
        console.error(`[Email] Resend API returned ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      // A failed email send should never take down whatever triggered it (a friend
      // request, a challenge, etc.) — log and move on, same principle as the
      // gateway's existing fire-and-forget async analysis passes.
      console.error('[Email] Failed to send:', err);
    }
  }
}
