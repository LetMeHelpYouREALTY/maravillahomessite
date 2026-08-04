import { z } from 'zod';

/**
 * Query-parameter validation for the `/api/callaction/*` route handlers.
 * Everything arrives as a string from `URLSearchParams`, so each schema
 * coerces before it validates and drops empty values.
 */

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value;

const pageSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).optional()
);

const perPageSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(200).optional()
);

/** ISO-8601 date (`2026-08-04`) or date-time (`2026-08-04T12:00:00Z`). */
const isoDateSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(value) &&
        !Number.isNaN(Date.parse(value)),
      { message: 'Expected an ISO-8601 date such as 2026-08-04.' }
    )
    .optional()
);

const trimmedString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional()
);

/**
 * A date range is all-or-nothing and must not run backwards. Applied with
 * `superRefine` so the checks compose onto any schema carrying the two fields.
 */
function withDateRange<S extends z.ZodTypeAny>(schema: S) {
  return schema.superRefine((value, ctx) => {
    const { start_date: startDate, end_date: endDate } = value as {
      start_date?: string;
      end_date?: string;
    };

    if (startDate && !endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'end_date is required when start_date is provided.',
        path: ['end_date'],
      });
    }

    if (endDate && !startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start_date is required when end_date is provided.',
        path: ['start_date'],
      });
    }

    if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start_date must be on or before end_date.',
        path: ['start_date'],
      });
    }
  });
}

const listContactsShape = z.object({
  page: pageSchema,
  per_page: perPageSchema,
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  channel_id: trimmedString,
  source_id: trimmedString,
  search: trimmedString,
});

/** `GET /api/callaction/contacts` — also covers the between-dates variant. */
export const listContactsQuerySchema = withDateRange(listContactsShape);

const contactActivityShape = z.object({
  page: pageSchema,
  per_page: perPageSchema,
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  type: trimmedString,
});

/** `GET /api/callaction/contacts/{contactId}/activity` */
export const contactActivityQuerySchema =
  withDateRange(contactActivityShape);

/** `GET /api/callaction/channels` and `GET /api/callaction/sources` */
export const paginationQuerySchema = z.object({
  page: pageSchema,
  per_page: perPageSchema,
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type ContactActivityQuery = z.infer<typeof contactActivityQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * `start_date`/`end_date` are the canonical names; `from`/`to` are accepted
 * as aliases so callers can use whichever reads better at the call site.
 */
export function searchParamsToObject(searchParams: URLSearchParams) {
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  if (params.from && !params.start_date) params.start_date = params.from;
  if (params.to && !params.end_date) params.end_date = params.to;
  delete params.from;
  delete params.to;

  return params;
}
