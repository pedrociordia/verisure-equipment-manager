import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AppDatabase = Database;

export type Session = {
  access_token: string;
  user: { id: string; email: string | null };
} | null;

export type AuthChangeCallback = (session: Session) => void;

export interface AuthAPI {
  signIn(email: string, password: string): Promise<{ error: Error | null }>;
  signOut(): Promise<void>;
  getSession(): Promise<Session>;
  getUser(): Promise<Session extends null ? null : { id: string; email: string | null } | null>;
  onAuthStateChange(cb: AuthChangeCallback): { unsubscribe: () => void };
}

export interface BackendAdapter {
  auth: AuthAPI;
  /**
   * Database query builder. Currently returns the raw Supabase/PostgREST
   * client. NOT portable across non-PostgREST providers — call sites must
   * be rewritten when migrating away from Supabase.
   */
  db: SupabaseClient<AppDatabase>;
  /** Call a server-side stored procedure / remote function. */
  rpc<Args extends Record<string, unknown> = Record<string, unknown>, Result = unknown>(
    name: string,
    args?: Args,
  ): Promise<{ data: Result | null; error: Error | null }>;
  /** Invoke a deployed edge / serverless function. */
  invokeFunction<Body = unknown, Result = unknown>(
    name: string,
    options?: { body?: Body; headers?: Record<string, string> },
  ): Promise<{ data: Result | null; error: Error | null }>;
}
