import { NextRequest, NextResponse } from 'next/server';

import { getContactActivity } from '@/lib/callaction/client';
import {
  contactActivityQuerySchema,
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
 * GET /api/callaction/contacts/{contactId}/activity
 *
 * Proxies `GET https://api.callaction.co/v2/contacts/{contactId}/activity`.
 *
 * Supported query params: `page`, `per_page`, `type`, and
 * `start_date`/`end_date` (aliases: `from`/`to`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    await requireSession();

    const { contactId } = await params;
    if (!contactId.trim()) {
      return NextResponse.json(
        { error: 'A contactId is required.' },
        { status: 400 }
      );
    }

    const query = parseQuery(
      contactActivityQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams)
    );

    const activity = await getContactActivity(contactId, query, {
      signal: request.signal,
    });

    return NextResponse.json(activity);
  } catch (error) {
    return toErrorResponse(error);
  }
}
