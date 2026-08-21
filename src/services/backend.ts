import { BackendHealth, ChatReply, VisionResult } from '../types';

/**
 * Thin client for the MycoGuard backend proxy.
 *
 * The backend is strictly OPTIONAL: every call degrades gracefully so the
 * app works fully offline (rule engine + knowledge chat in rule mode).
 * No credentials ever live in the frontend — the proxy owns them.
 */

const API_BASE = '/api';

export class OfflineError extends Error {
  constructor(message = '视觉服务不可用（离线模式）') {
    super(message);
    this.name = 'OfflineError';
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === 'string' ? body.detail : res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Probe backend capabilities with a hard timeout. Returns null when offline. */
export async function probeHealth(timeoutMs = 2500): Promise<BackendHealth | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as BackendHealth;
    return body?.status === 'ok' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Upload a photo for vision analysis (multipart). Throws OfflineError when the vision service is not configured. */
export async function analyzePhoto(file: Blob, fileName = 'mushroom.jpg'): Promise<VisionResult> {
  const form = new FormData();
  form.append('file', file, fileName);
  const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
  if (res.status === 503) throw new OfflineError(await safeText(res));
  if (!res.ok) throw new ApiError(await safeText(res));
  return (await res.json()) as VisionResult;
}

/** Ask the safety-knowledge Q&A endpoint. */
export async function askChat(question: string): Promise<ChatReply> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new ApiError(await safeText(res));
  return (await res.json()) as ChatReply;
}
