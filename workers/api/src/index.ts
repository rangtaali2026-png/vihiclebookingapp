import { handleAutoAllotBooking, handleAdminOverrideAllotment, handleCancelBooking } from './routes/dispatch';

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/dispatch/auto-allot
    if (request.method === 'POST' && url.pathname === '/api/dispatch/auto-allot') {
      return handleAutoAllotBooking(request, env);
    }

    // POST /api/dispatch/override
    if (request.method === 'POST' && url.pathname === '/api/dispatch/override') {
      return handleAdminOverrideAllotment(request, env);
    }

    // POST /api/dispatch/cancel
    if (request.method === 'POST' && url.pathname === '/api/dispatch/cancel') {
      return handleCancelBooking(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

export interface NotificationMessage {
  eventType: string;
  siteId: string;
  bookingId: string;
  recipientPhone: string;
  recipientEmail?: string;
  payload: Record<string, string>;
}

export interface Env {
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  SMS_GATEWAY_URL: string;
  SMS_GATEWAY_API_KEY: string;
}

export default {
  async queue(batch: MessageBatch<NotificationMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { eventType, recipientPhone, payload } = msg.body;

      try {
        if (eventType === 'BOOKING_DISPATCHED') {
          // Parallel dispatch to WhatsApp and SMS from Cloudflare Cloud Egress
          await Promise.allSettled([
            sendWhatsAppTemplate(env, recipientPhone, payload),
            sendSmsDltTemplate(env, recipientPhone, payload)
          ]);
        }
        msg.ack(); // Mark complete
      } catch (err) {
        console.error(`Dispatch failure for booking ${msg.body.bookingId}:`, err);
        msg.retry(); // Automatic backoff retry
      }
    }
  }
};

async function sendWhatsAppTemplate(env: Env, phone: string, data: Record<string, string>) {
  const url = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'vehicle_booking_confirmation',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.requesterName },
              { type: 'text', text: `${data.vehicleModel} (${data.vehiclePlate})` },
              { type: 'text', text: `${data.driverName} (${data.driverPhone})` },
              { type: 'text', text: data.pickupTime },
              { type: 'text', text: data.destination }
            ]
          }
        ]
      }
    })
  });
}

async function sendSmsDltTemplate(env: Env, phone: string, data: Record<string, string>) {
  const params = new URLSearchParams({
    apikey: env.SMS_GATEWAY_API_KEY,
    sender: 'PLNTRN',
    numbers: phone,
    message: `Your plant vehicle ${data.vehiclePlate} with driver ${data.driverName} (${data.driverPhone}) is confirmed for ${data.pickupTime}.`
  });
  await fetch(`${env.SMS_GATEWAY_URL}?${params.toString()}`, { method: 'GET' });
}