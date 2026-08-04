import { NextRequest, NextResponse } from 'next/server';

import { listChannels } from '@/lib/callaction/client';
import {
  paginationQuerySchema,
  searchParamsToObject,
} from '@/lib/callaction/schemas';
import {
  parseQuery,
  requireSession,
  toErrorResponse,
} from '@/lib/callaction/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/callaction/channels
 *
 * Proxies `GET https://api.callaction.co/v2/channels`.
 * Supported query params: `page`, `per_page`.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const query = parseQuery(
      paginationQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams)
    );

    const channels = await listChannels(query, { signal: request.signal });

    return NextResponse.json(channels);
  } catch (error) {
    return toErrorResponse(error);
  }
}
