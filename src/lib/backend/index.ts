/**
 * Backend frontier — see ./README.md
 *
 * The rest of the app must import from `@/lib/backend` only, never from
 * `@/integrations/supabase/client` or `@supabase/supabase-js`. To swap
 * providers, replace the adapter selected below.
 */
import { supabaseAdapter } from './adapter.supabase';
import type { BackendAdapter } from './types';

const provider = (import.meta.env.VITE_BACKEND_PROVIDER ?? 'supabase') as string;

const backend: BackendAdapter = (() => {
  switch (provider) {
    case 'supabase':
      return supabaseAdapter;
    default:
      throw new Error(
        `Unknown backend provider: ${provider}. Add an adapter in src/lib/backend/ and register it here.`,
      );
  }
})();

export const auth = backend.auth;
export const db = backend.db;
export const rpc = backend.rpc.bind(backend);
export const invokeFunction = backend.invokeFunction.bind(backend);

/**
 * @deprecated Prefer the named exports (`auth`, `db`, `rpc`, `invokeFunction`).
 * Kept as a thin alias so existing call sites that read `supabase.from(...)`
 * keep working with a one-line import change.
 */
export const supabase = backend.db;

export type { BackendAdapter, Session, AuthAPI } from './types';
