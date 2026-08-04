import { NextRequest, NextResponse } from 'next/server';

import { listSources } from '@/lib/callaction/client';
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
 * GET /api/callaction/sources
 *
 * Proxies `GET https://api.callaction.co/v2/sources`.
 * Supported query params: `page`, `per_page`.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const query = parseQuery(
      paginationQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams)
    );

    const sources = await listSources(query, { signal: request.signal });

    return NextResponse.json(sources);
  } catch (error) {
    return toErrorResponse(error);
  }
}
