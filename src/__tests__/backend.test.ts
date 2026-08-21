import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeHealth, analyzePhoto, OfflineError, ApiError } from '../services/backend';
import { VisionResult } from '../types';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('probeHealth', () => {
  it('returns health when the backend answers', async () => {
    stubFetch(() => Promise.resolve(okJson({ status: 'ok', version: '2.0.0', vision: true, chat: true })));
    const health = await probeHealth(1000);
    expect(health?.status).toBe('ok');
    expect(health?.vision).toBe(true);
  });

  it('returns null when the backend is unreachable (offline mode)', async () => {
    stubFetch(() => Promise.reject(new TypeError('network down')));
    const health = await probeHealth(500);
    expect(health).toBeNull();
  });

  it('returns null on non-ok status', async () => {
    stubFetch(() => Promise.resolve(new Response('boom', { status: 500 })));
    expect(await probeHealth(500)).toBeNull();
  });
});

describe('analyzePhoto', () => {
  const vision: VisionResult = {
    status: 'ok',
    speciesGuess: 'Amanita muscaria',
    modelConfidence: 0.9,
    traits: { capColor: 'r' },
    notes: 'red cap',
    warnings: [],
  };

  it('posts multipart and returns the vision result', async () => {
    const seen = new Promise<{ input: RequestInfo | URL; init?: RequestInit }>((resolve) => {
      stubFetch((input, init) => {
        resolve({ input, init });
        return Promise.resolve(okJson(vision));
      });
    });
    const file = new File(['x'], 'mushroom.png', { type: 'image/png' });
    const result = await analyzePhoto(file);
    const call = await seen;
    expect(String(call.input)).toBe('/api/analyze');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.body).toBeInstanceOf(FormData);
    expect(result.speciesGuess).toBe('Amanita muscaria');
  });

  it('throws OfflineError on 503 (backend has no vision key)', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const file = new File(['x'], 'm.png', { type: 'image/png' });
    await expect(analyzePhoto(file)).rejects.toBeInstanceOf(OfflineError);
  });

  it('throws ApiError on other failures', async () => {
    stubFetch(() => Promise.resolve(new Response('bad image', { status: 415 })));
    const file = new File(['x'], 'm.png', { type: 'image/png' });
    await expect(analyzePhoto(file)).rejects.toBeInstanceOf(ApiError);
  });
});
