import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/db/queries';
import { CallActionApiError, CallActionConfigError } from './client';

export class UnauthorizedError extends Error {
  constructor() {
    super('Authentication required.');
    this.name = 'UnauthorizedError';
  }
}

/**
 * The `/api/*` paths are excluded from the global middleware matcher, so each
 * CallAction route gates itself: the proxy carries a server-side API token and
 * must never be reachable anonymously.
 */
export async function requireSession() {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Validates search params, throwing `z.ZodError` for `toErrorResponse`. */
export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string>
): z.infer<T> {
  return schema.parse(params);
}

/**
 * Upstream status -> status we return.
 *
 * A 401/403 from CallAction means *our* token is bad, not that the caller is
 * unauthenticated, so it surfaces as a 502 rather than a misleading 401.
 */
function mapUpstreamStatus(status: number) {
  if (status === 404) return 404;
  if (status === 429) return 429;
  if (status === 400 || status === 422) return 400;
  return 502;
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Invalid query parameters.', details: error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (error instanceof CallActionConfigError) {
    console.error('CallAction configuration error:', error.message);
    return NextResponse.json(
      { error: 'The CallAction integration is not configured.' },
      { status: 500 }
    );
  }

  if (error instanceof CallActionApiError) {
    console.error(
      `CallAction request failed (${error.status}):`,
      error.message
    );
    const status = mapUpstreamStatus(error.status);
    return NextResponse.json(
      {
        error:
          status === 400 || status === 404
            ? error.message
            : 'The CallAction API request failed.',
        upstreamStatus: error.status,
      },
      { status }
    );
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return NextResponse.json(
      { error: 'The CallAction API did not respond in time.' },
      { status: 504 }
    );
  }

  console.error('Unexpected CallAction route error:', error);
  return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
}
