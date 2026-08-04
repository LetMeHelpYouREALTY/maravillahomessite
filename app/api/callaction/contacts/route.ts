import { NextRequest, NextResponse } from 'next/server';

import { listContacts } from '@/lib/callaction/client';
import {
  listContactsQuerySchema,
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
 * GET /api/callaction/contacts
 *
 * Proxies `GET https://api.callaction.co/v2/contacts`.
 *
 * Supported query params: `page`, `per_page`, `channel_id`, `source_id`,
 * `search`, plus `start_date`/`end_date` (aliases: `from`/`to`) for the
 * between-dates variant. Supplying one date without the other is a 400.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const query = parseQuery(
      listContactsQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams)
    );

    const contacts = await listContacts(query, { signal: request.signal });

    return NextResponse.json(contacts);
  } catch (error) {
    return toErrorResponse(error);
  }
}
