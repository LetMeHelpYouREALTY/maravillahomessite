/**
 * Types for the CallAction v2 API (https://api.callaction.co/v2).
 *
 * The upstream payloads are not versioned by a published schema, so every
 * field is optional and each record keeps an index signature. That way an
 * added or renamed upstream field never breaks a build here — callers get
 * autocomplete for the fields we know about without us pretending to know
 * the full shape.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CallActionContact {
  id?: string | number;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  company?: string | null;
  status?: string | null;
  channel_id?: string | number | null;
  source_id?: string | number | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface CallActionActivity {
  id?: string | number;
  contact_id?: string | number;
  type?: string | null;
  direction?: string | null;
  body?: string | null;
  duration?: number | null;
  channel_id?: string | number | null;
  source_id?: string | number | null;
  occurred_at?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface CallActionChannel {
  id?: string | number;
  name?: string | null;
  type?: string | null;
  phone_number?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface CallActionSource {
  id?: string | number;
  name?: string | null;
  type?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

/**
 * List endpoints have been observed returning either a bare array or an
 * envelope such as `{ data: [...], meta: {...} }`. `unwrapList` in
 * `./client` normalizes both into this shape.
 */
export interface CallActionList<T> {
  data: T[];
  meta?: Record<string, JsonValue>;
}
