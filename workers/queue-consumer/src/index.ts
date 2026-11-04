// =============================================================================
// File: workers/queue-consumer/src/index.ts
// Description: Cloudflare Queue Consumer for Firewall-Bypass Notification Egress
// Integrations: WhatsApp Business Cloud API (Meta Graph API) & DLT-Compliant SMS
// Target: Cloudflare Workers (V8 Edge Runtime)
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared-types/src/database.types';

export interface NotificationPayload {
  eventType:
    | 'BOOKING_DISPATCHED'
    | 'BOOKING_CANCELLED'
    | 'TRIP_COMPLETED'
    | 'DRIVER_MANIFEST_ASSIGNED';
  siteId: string;
  bookingId: string;
  recipientPhone: string;
  recipientEmail?: string;
  payload: {
    requesterName?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    driverName?: string;
    driverPhone?: string;
    pickupTime?: string;
    origin?: string;
    destination?: string;
    passengerCount?: number;
    reason?: string;
    feedbackUrl?: string;
  };
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Fallback defaults if site-specific gateway records are unconfigured
  DEFAULT_WHATSAPP_TOKEN?: string;
  DEFAULT_WHATSAPP_PHONE_ID?: string;
  DEFAULT_SMS_GATEWAY_URL?: string;
  DEFAULT_SMS_API_KEY?: string;
}

interface WhatsAppGatewayConfig {
  phone_number_id: string;
  access_token?: string;
  template_namespace?: string;
  default_language?: string;
}

interface SmsGatewayConfig {
  sender_id: string;
  entity_id: string;
  api_key?: string;
  booking_template_id?: string;
  cancel_template_id?: string;
  completion_template_id?: string;
}

export default {
  async queue(batch: MessageBatch<NotificationPayload>, env: Env): Promise<void> {
    const supabase = createClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    // Process batch messages concurrently
    await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const messageBody = msg.body;

        try {
          await processNotificationEvent(supabase, env, messageBody);
          msg.ack(); // Successfully acknowledged
        } catch (err) {
          console.error(
            `[Queue Error] Notification failed for booking ${messageBody.bookingId}:`,
            err
          );
          // Retry with exponential backoff up to queue max_retries limit
          msg.retry();
        }
      })
    );
  },
};

/**
 * Resolves site-specific gateway configurations and dispatches messaging payloads
 */
async function processNotificationEvent(
  supabase: ReturnType<typeof createClient<Database>>,
  env: Env,
  event: NotificationPayload
): Promise<void> {
  const { siteId, recipientPhone, eventType, payload } = event;

  // Sanitize Indian phone format (ensure country code 91 prefix without symbols)
  const sanitizedPhone = formatIndianPhoneNumber(recipientPhone);
  if (!sanitizedPhone) {
    console.warn(`[Invalid Phone] Skipping notification for phone: ${recipientPhone}`);
    return;
  }

  // 1. Fetch Tenant Gateway Credentials from site_gateways table
  const { data: gateways } = await supabase
    .from('site_gateways')
    .select('*')
    .eq('site_id', siteId)
    .eq('is_enabled', true);

  const whatsappGateway = gateways?.find((g) => g.channel === 'WHATSAPP');
  const smsGateway = gateways?.find((g) => g.channel === 'SMS');

  const dispatchPromises: Promise<any>[] = [];

  // 2. Dispatch WhatsApp Notification
  if (whatsappGateway) {
    const creds = whatsappGateway.auth_credentials as unknown as WhatsAppGatewayConfig;
    const phoneId = creds.phone_number_id || env.DEFAULT_WHATSAPP_PHONE_ID;
    const token = creds.access_token || env.DEFAULT_WHATSAPP_TOKEN;

    if (phoneId && token) {
      dispatchPromises.push(
        sendWhatsAppMessage({
          phoneNumberId: phoneId,
          accessToken: token,
          recipientPhone: sanitizedPhone,
          eventType,
          payload,
        })
      );
    }
  }

  // 3. Dispatch DLT-Compliant Telecom SMS Notification
  if (smsGateway && smsGateway.api_endpoint) {
    const creds = smsGateway.auth_credentials as unknown as SmsGatewayConfig;
    dispatchPromises.push(
      sendDltSmsMessage({
        endpoint: smsGateway.api_endpoint,
        creds,
        defaultApiKey: env.DEFAULT_SMS_API_KEY,
        recipientPhone: sanitizedPhone,
        eventType,
        payload,
      })
    );
  }

  // Wait for all enabled channels to deliver
  const results = await Promise.allSettled(dispatchPromises);
  results.forEach((res, index) => {
    if (res.status === 'rejected') {
      console.error(`[Dispatch Failure Channel #${index}]:`, res.reason);
    }
  });
}

/**
 * Meta WhatsApp Business Cloud API Dispatcher
 */
async function sendWhatsAppMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  eventType: NotificationPayload['eventType'];
  payload: NotificationPayload['payload'];
}): Promise<void> {
  const { phoneNumberId, accessToken, recipientPhone, eventType, payload } = params;
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  let templateName = 'vehicle_booking_confirmation';
  let bodyParameters: { type: string; text: string }[] = [];

  switch (eventType) {
    case 'BOOKING_DISPATCHED':
      templateName = 'vehicle_booking_confirmation';
      bodyParameters = [
        { type: 'text', text: payload.requesterName || 'Employee' },
        { type: 'text', text: `${payload.vehicleModel} (${payload.vehiclePlate})` },
        { type: 'text', text: `${payload.driverName} (${payload.driverPhone})` },
        { type: 'text', text: payload.pickupTime || 'Scheduled Time' },
        { type: 'text', text: payload.destination || 'Plant Site' },
      ];
      break;

    case 'BOOKING_CANCELLED':
      templateName = 'vehicle_booking_cancellation';
      bodyParameters = [
        { type: 'text', text: payload.requesterName || 'Employee' },
        { type: 'text', text: payload.pickupTime || 'Scheduled Time' },
        { type: 'text', text: payload.reason || 'Administrative adjustment' },
      ];
      break;

    case 'TRIP_COMPLETED':
      templateName = 'vehicle_trip_completed_feedback';
      bodyParameters = [
        { type: 'text', text: payload.requesterName || 'Employee' },
        { type: 'text', text: payload.vehiclePlate || 'Assigned Vehicle' },
        { type: 'text', text: payload.feedbackUrl || 'https://transit.plant.internal' },
      ];
      break;

    case 'DRIVER_MANIFEST_ASSIGNED':
      templateName = 'driver_trip_assignment';
      bodyParameters = [
        { type: 'text', text: payload.driverName || 'Driver' },
        { type: 'text', text: payload.vehiclePlate || 'Vehicle' },
        { type: 'text', text: payload.pickupTime || 'Pickup Time' },
        { type: 'text', text: payload.origin || 'Plant Gate' },
        { type: 'text', text: String(payload.passengerCount || 1) },
      ];
      break;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: bodyParameters,
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API responded with status ${response.status}: ${errorText}`);
  }
}

/**
 * Indian DLT-Compliant HTTP SMS Gateway Dispatcher
 */
async function sendDltSmsMessage(params: {
  endpoint: string;
  creds: SmsGatewayConfig;
  defaultApiKey?: string;
  recipientPhone: string;
  eventType: NotificationPayload['eventType'];
  payload: NotificationPayload['payload'];
}): Promise<void> {
  const { endpoint, creds, defaultApiKey, recipientPhone, eventType, payload } = params;

  // Strip international 91 prefix for domestic Indian SMS gateways expecting 10 digits
  const domesticPhone = recipientPhone.startsWith('91') && recipientPhone.length === 12
    ? recipientPhone.substring(2)
    : recipientPhone;

  let messageText = '';
  let templateId = creds.booking_template_id;

  if (eventType === 'BOOKING_DISPATCHED') {
    templateId = creds.booking_template_id;
    messageText = `Your plant transport is confirmed. Vehicle: ${payload.vehiclePlate}, Driver: ${payload.driverName} (${payload.driverPhone}), Time: ${payload.pickupTime}. Plant Logistics`;
  } else if (eventType === 'BOOKING_CANCELLED') {
    templateId = creds.cancel_template_id;
    messageText = `Your plant transit booking for ${payload.pickupTime} has been cancelled. Reason: ${payload.reason}. Plant Logistics`;
  } else if (eventType === 'TRIP_COMPLETED') {
    templateId = creds.completion_template_id;
    messageText = `Trip completed. Please rate your transit experience: ${payload.feedbackUrl}. Plant Logistics`;
  } else {
    messageText = `Trip update: Vehicle ${payload.vehiclePlate} assigned for ${payload.pickupTime}. Plant Logistics`;
  }

  // Construct query/body payload per standard DLT HTTP gateway spec
  const url = new URL(endpoint);
  url.searchParams.set('apikey', creds.api_key || defaultApiKey || '');
  url.searchParams.set('sender', creds.sender_id);
  url.searchParams.set('entity_id', creds.entity_id);
  if (templateId) {
    url.searchParams.set('template_id', templateId);
  }
  url.searchParams.set('numbers', domesticPhone);
  url.searchParams.set('message', messageText);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SMS Gateway responded with status ${response.status}: ${errText}`);
  }
}

/**
 * Standardizes raw phone input to E.164 without '+' for international routing
 */
function formatIndianPhoneNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return null;
}