import 'server-only';

import type {
  CallActionActivity,
  CallActionChannel,
  CallActionContact,
  CallActionList,
  CallActionSource,
  JsonValue,
} from './types';

const DEFAULT_BASE_URL = 'https://api.callaction.co/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * How the API token is presented to CallAction. Configurable because the
 * account-level token can be issued for either header or query-string use:
 *
 *   bearer (default) -> `Authorization: Bearer <token>`
 *   token            -> `Authorization: Token <token>`
 *   header           -> `X-API-Key: <token>`
 *   query            -> `?api_token=<token>`
 */
export type CallActionAuthStyle = 'bearer' | 'token' | 'header' | 'query';

const AUTH_STYLES: CallActionAuthStyle[] = [
  'bearer',
  'token',
  'header',
  'query',
];

export class CallActionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallActionConfigError';
  }
}

export class CallActionApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: JsonValue | string | null;

  constructor(
    message: string,
    options: { status: number; url: string; body: JsonValue | string | null }
  ) {
    super(message);
    this.name = 'CallActionApiError';
    this.status = options.status;
    this.url = options.url;
    this.body = options.body;
  }
}

function readConfig() {
  const token = process.env.CALLACTION_API_TOKEN;
  if (!token) {
    throw new CallActionConfigError(
      'CALLACTION_API_TOKEN is not set. Add it to your environment to call the CallAction API.'
    );
  }

  const baseUrl = (process.env.CALLACTION_API_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');

  const configuredStyle = (
    process.env.CALLACTION_AUTH_STYLE || 'bearer'
  ).trim() as CallActionAuthStyle;

  if (!AUTH_STYLES.includes(configuredStyle)) {
    throw new CallActionConfigError(
      `CALLACTION_AUTH_STYLE must be one of ${AUTH_STYLES.join(', ')} (received "${configuredStyle}").`
    );
  }

  const timeoutMs = Number(
    process.env.CALLACTION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
  );

  return {
    token,
    baseUrl,
    authStyle: configuredStyle,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS,
  };
}

export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

function buildUrl(baseUrl: string, path: string, params: QueryParams = {}) {
  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

function combineSignals(timeoutMs: number, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  // AbortSignal.any lands in Node 20.3; fall back to the caller's signal.
  return typeof AbortSignal.any === 'function'
    ? AbortSignal.any([timeoutSignal, signal])
    : signal;
}

function retryDelayMs(attempt: number, response?: Response) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  return 300 * 2 ** attempt;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(response: Response): Promise<JsonValue | string | null> {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) return text;

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function errorMessage(status: number, body: JsonValue | string | null) {
  if (typeof body === 'string' && body.trim()) {
    return `CallAction API responded ${status}: ${body.slice(0, 300)}`;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const detail = body.message ?? body.error ?? body.errors;
    if (detail) {
      return `CallAction API responded ${status}: ${JSON.stringify(detail).slice(0, 300)}`;
    }
  }
  return `CallAction API responded ${status}.`;
}

/**
 * Low-level GET against the CallAction API. Handles auth, timeouts and
 * retries for transient failures (429 and 5xx), and throws
 * `CallActionApiError` for anything the API rejects.
 */
export async function callActionRequest<T = JsonValue>(
  path: string,
  options: { params?: QueryParams; signal?: AbortSignal } = {}
): Promise<T> {
  const { token, baseUrl, authStyle, timeoutMs } = readConfig();
  const params = { ...(options.params ?? {}) };

  if (authStyle === 'query') {
    params.api_token = token;
  }

  const url = buildUrl(baseUrl, path, params);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authStyle === 'bearer') headers.Authorization = `Bearer ${token}`;
  if (authStyle === 'token') headers.Authorization = `Token ${token}`;
  if (authStyle === 'header') headers['X-API-Key'] = token;

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs(attempt - 1));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: combineSignals(timeoutMs, options.signal),
      });
    } catch (error) {
      // The caller gave up, or the request timed out — don't keep retrying a
      // cancelled request.
      if (options.signal?.aborted) throw error;
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      continue;
    }

    if (response.ok) {
      return (await readBody(response)) as T;
    }

    const body = await readBody(response);

    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
      lastError = new CallActionApiError(errorMessage(response.status, body), {
        status: response.status,
        url: url.toString(),
        body,
      });
      await sleep(retryDelayMs(attempt, response));
      continue;
    }

    throw new CallActionApiError(errorMessage(response.status, body), {
      status: response.status,
      url: url.toString(),
      body,
    });
  }

  if (lastError instanceof CallActionApiError) throw lastError;

  throw new CallActionApiError(
    `Could not reach the CallAction API: ${
      lastError instanceof Error ? lastError.message : 'unknown error'
    }`,
    { status: 502, url: url.toString(), body: null }
  );
}

/**
 * Normalizes the two response shapes CallAction returns for list endpoints —
 * a bare array, or an envelope keyed by `data`/`results`/`contacts`/etc.
 */
export function unwrapList<T>(payload: unknown, key?: string): CallActionList<T> {
  if (Array.isArray(payload)) {
    return { data: payload as T[] };
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [key, 'data', 'results', 'items'].filter(
      Boolean
    ) as string[];

    for (const candidate of candidates) {
      if (Array.isArray(record[candidate])) {
        const { [candidate]: _omitted, ...rest } = record;
        const meta = Object.keys(rest).length
          ? (rest as CallActionList<T>['meta'])
          : undefined;
        return { data: record[candidate] as T[], meta };
      }
    }
  }

  return { data: [] };
}

export interface ListContactsParams {
  page?: number;
  per_page?: number;
  /** Inclusive lower bound, ISO-8601 date or date-time. */
  start_date?: string;
  /** Inclusive upper bound, ISO-8601 date or date-time. */
  end_date?: string;
  channel_id?: string;
  source_id?: string;
  search?: string;
}

/**
 * GET /v2/contacts
 *
 * Passing `start_date`/`end_date` is the "list contacts between dates" call —
 * same endpoint, date-bounded.
 */
export async function listContacts(
  params: ListContactsParams = {},
  options: { signal?: AbortSignal } = {}
): Promise<CallActionList<CallActionContact>> {
  const payload = await callActionRequest('/contacts', {
    params: params as QueryParams,
    signal: options.signal,
  });
  return unwrapList<CallActionContact>(payload, 'contacts');
}

export interface ContactActivityParams {
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
  type?: string;
}

/** GET /v2/contacts/{contactId}/activity */
export async function getContactActivity(
  contactId: string,
  params: ContactActivityParams = {},
  options: { signal?: AbortSignal } = {}
): Promise<CallActionList<CallActionActivity>> {
  const payload = await callActionRequest(
    `/contacts/${encodeURIComponent(contactId)}/activity`,
    { params: params as QueryParams, signal: options.signal }
  );
  return unwrapList<CallActionActivity>(payload, 'activity');
}

export interface ListParams {
  page?: number;
  per_page?: number;
}

/** GET /v2/channels */
export async function listChannels(
  params: ListParams = {},
  options: { signal?: AbortSignal } = {}
): Promise<CallActionList<CallActionChannel>> {
  const payload = await callActionRequest('/channels', {
    params: params as QueryParams,
    signal: options.signal,
  });
  return unwrapList<CallActionChannel>(payload, 'channels');
}

/** GET /v2/sources */
export async function listSources(
  params: ListParams = {},
  options: { signal?: AbortSignal } = {}
): Promise<CallActionList<CallActionSource>> {
  const payload = await callActionRequest('/sources', {
    params: params as QueryParams,
    signal: options.signal,
  });
  return unwrapList<CallActionSource>(payload, 'sources');
}
