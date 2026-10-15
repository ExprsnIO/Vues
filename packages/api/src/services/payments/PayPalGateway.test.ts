import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayPalGateway } from './PayPalGateway.js';

vi.mock('@paypal/checkout-server-sdk', () => ({
  default: { core: {
    PayPalHttpClient: class {}, SandboxEnvironment: class {}, LiveEnvironment: class {},
  } },
}));

const headers = {
  'paypal-transmission-id': 'transmission-123',
  'paypal-transmission-time': '2026-10-15T12:00:00Z',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
};
const event = { id: 'event-123', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'capture-123' } };

afterEach(() => vi.unstubAllGlobals());

describe('PayPal webhook verification', () => {
  it.each([true, false])('uses PayPal verification in sandbox=%s', async (testMode) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: 'SUCCESS' })));
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new PayPalGateway({ clientId: 'client', clientSecret: 'secret', webhookId: 'hook-123' }, testMode);
    expect(await gateway.verifyWebhookSignature(JSON.stringify(event), 'signature', headers)).toBe(true);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`https://api-m.${testMode ? 'sandbox.' : ''}paypal.com/v1/notifications/verify-webhook-signature`);
    expect(JSON.parse(init.body)).toEqual({
      transmission_id: headers['paypal-transmission-id'], transmission_time: headers['paypal-transmission-time'],
      cert_url: headers['paypal-cert-url'], auth_algo: headers['paypal-auth-algo'],
      transmission_sig: 'signature', webhook_id: 'hook-123', webhook_event: event,
    });
    expect(init.headers.Authorization).toBe('Bearer access-token');
  });
  it('rejects missing headers without calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new PayPalGateway({ clientId: 'client', clientSecret: 'secret', webhookId: 'hook-123' });
    expect(await gateway.verifyWebhookSignature('{}', 'signature')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a provider verification failure', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: 'FAILURE' }))));
    const gateway = new PayPalGateway({ clientId: 'client', clientSecret: 'secret', webhookId: 'hook-123' });
    expect(await gateway.verifyWebhookSignature(JSON.stringify(event), 'forged', headers)).toBe(false);
  });
  it('does not treat a verification API outage as successful verification', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' })))
      .mockResolvedValueOnce(new Response('', { status: 503 })));
    const gateway = new PayPalGateway({ clientId: 'client', clientSecret: 'secret', webhookId: 'hook-123' });
    await expect(gateway.verifyWebhookSignature(JSON.stringify(event), 'signature', headers)).rejects.toThrow();
  });
});
