/**
 * Webhook Service
 * Sends notifications to external systems when audits complete
 */

import { v4 as uuidv4 } from 'uuid';
import { withRetry } from '../utils/resilience';
import { getCorrelationId } from '../utils/context';
import { redactObject } from '../utils/piiRedaction';

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  retryCount: number;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEvent = 
  | 'audit.completed'
  | 'audit.failed'
  | 'dispute.created'
  | 'dispute.resolved'
  | 'waiver.approved'
  | 'waiver.rejected'
  | 'spec.activated'
  | 'spec.deactivated';

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  correlationId?: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  webhookId: string;
  event: WebhookEvent;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryCount: number;
}

// In-memory webhook registry (in production, this would be in the database)
const webhookRegistry: Map<string, WebhookConfig> = new Map();

// Delivery log for debugging
const deliveryLog: WebhookDeliveryResult[] = [];
const MAX_DELIVERY_LOG = 1000;

/**
 * Register a new webhook
 */
export function registerWebhook(
  url: string,
  events: WebhookEvent[],
  options: Partial<Omit<WebhookConfig, 'id' | 'url' | 'events' | 'createdAt' | 'updatedAt'>> = {}
): WebhookConfig {
  const webhook: WebhookConfig = {
    id: uuidv4(),
    url,
    secret: options.secret || generateSecret(),
    events,
    active: options.active ?? true,
    retryCount: options.retryCount ?? 3,
    timeoutMs: options.timeoutMs ?? 10000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  webhookRegistry.set(webhook.id, webhook);
  console.log(`[Webhooks] Registered webhook ${webhook.id} for events: ${events.join(', ')}`);
  
  return webhook;
}

/**
 * Generate a random secret for webhook signing
 */
function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let secret = 'whsec_';
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

/**
 * Create HMAC signature for webhook payload
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deliver a webhook to a single endpoint
 */
async function deliverWebhook(
  webhook: WebhookConfig,
  payload: WebhookPayload
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);
  
  try {
    const signature = await signPayload(payloadString, webhook.secret);
    
    const response = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), webhook.timeoutMs);
        
        try {
          const res = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-ID': webhook.id,
              'X-Webhook-Event': payload.event,
              'X-Webhook-Signature': `sha256=${signature}`,
              'X-Webhook-Timestamp': payload.timestamp,
              'X-Correlation-ID': payload.correlationId || '',
            },
            body: payloadString,
            signal: controller.signal,
          });
          
          if (!res.ok && res.status >= 500) {
            throw new Error(`Server error: ${res.status}`);
          }
          
          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: webhook.retryCount,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
      }
    );

    const responseTime = Date.now() - startTime;
    
    return {
      success: response.ok,
      webhookId: webhook.id,
      event: payload.event,
      statusCode: response.status,
      responseTime,
      retryCount: 0,
    };
    
  } catch (error) {
    return {
      success: false,
      webhookId: webhook.id,
      event: payload.event,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryCount: webhook.retryCount,
    };
  }
}

/**
 * Emit a webhook event to all registered endpoints
 */
export async function emitWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: { redactPII?: boolean } = {}
): Promise<WebhookDeliveryResult[]> {
  const correlationId = getCorrelationId();
  
  // Find all webhooks subscribed to this event
  const subscribers = Array.from(webhookRegistry.values())
    .filter(w => w.active && w.events.includes(event));
  
  if (subscribers.length === 0) {
    console.log(`[Webhooks] No subscribers for event: ${event}`);
    return [];
  }

  // Optionally redact PII from data
  const safeData = options.redactPII ? redactObject(data) : data;

  const payload: WebhookPayload = {
    id: uuidv4(),
    event,
    timestamp: new Date().toISOString(),
    correlationId,
    data: safeData,
  };

  console.log(`[Webhooks] Emitting ${event} to ${subscribers.length} subscribers`, {
    correlationId,
    payloadId: payload.id,
  });

  // Deliver to all subscribers in parallel
  const results = await Promise.all(
    subscribers.map(webhook => deliverWebhook(webhook, payload))
  );

  // Log delivery results
  for (const result of results) {
    addToDeliveryLog(result);
    
    if (!result.success) {
      console.error(`[Webhooks] Delivery failed`, {
        webhookId: result.webhookId,
        event: result.event,
        error: result.error,
      });
    }
  }

  return results;
}

/**
 * Add result to delivery log
 */
function addToDeliveryLog(result: WebhookDeliveryResult): void {
  deliveryLog.push(result);
  
  // Trim log if too large
  while (deliveryLog.length > MAX_DELIVERY_LOG) {
    deliveryLog.shift();
  }
}

/**
 * Get webhook by ID
 */
export function getWebhook(id: string): WebhookConfig | undefined {
  return webhookRegistry.get(id);
}

/**
 * List all webhooks
 */
export function listWebhooks(): WebhookConfig[] {
  return Array.from(webhookRegistry.values());
}

/**
 * Update webhook configuration
 */
export function updateWebhook(
  id: string,
  updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt'>>
): WebhookConfig | undefined {
  const webhook = webhookRegistry.get(id);
  if (!webhook) return undefined;

  const updated: WebhookConfig = {
    ...webhook,
    ...updates,
    updatedAt: new Date(),
  };

  webhookRegistry.set(id, updated);
  return updated;
}

/**
 * Delete a webhook
 */
export function deleteWebhook(id: string): boolean {
  return webhookRegistry.delete(id);
}

/**
 * Get recent delivery log
 */
export function getDeliveryLog(limit: number = 100): WebhookDeliveryResult[] {
  return deliveryLog.slice(-limit);
}

/**
 * Test webhook endpoint
 */
export async function testWebhook(id: string): Promise<WebhookDeliveryResult> {
  const webhook = webhookRegistry.get(id);
  if (!webhook) {
    return {
      success: false,
      webhookId: id,
      event: 'audit.completed',
      error: 'Webhook not found',
      retryCount: 0,
    };
  }

  const testPayload: WebhookPayload = {
    id: uuidv4(),
    event: 'audit.completed',
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: 'This is a test webhook delivery',
    },
  };

  return deliverWebhook(webhook, testPayload);
}

// Convenience functions for common events
export const webhookEvents = {
  auditCompleted: (auditId: number, result: string, score: number) =>
    emitWebhookEvent('audit.completed', { auditId, result, score }, { redactPII: true }),
  
  auditFailed: (auditId: number, error: string) =>
    emitWebhookEvent('audit.failed', { auditId, error }),
  
  disputeCreated: (disputeId: number, auditId: number, reason: string) =>
    emitWebhookEvent('dispute.created', { disputeId, auditId, reason }),
  
  disputeResolved: (disputeId: number, resolution: string) =>
    emitWebhookEvent('dispute.resolved', { disputeId, resolution }),
  
  waiverApproved: (waiverId: number, auditId: number, approver: string) =>
    emitWebhookEvent('waiver.approved', { waiverId, auditId, approver }),
  
  waiverRejected: (waiverId: number, auditId: number, reason: string) =>
    emitWebhookEvent('waiver.rejected', { waiverId, auditId, reason }),
  
  specActivated: (specId: number, name: string, version: string) =>
    emitWebhookEvent('spec.activated', { specId, name, version }),
  
  specDeactivated: (specId: number, name: string) =>
    emitWebhookEvent('spec.deactivated', { specId, name }),
};
