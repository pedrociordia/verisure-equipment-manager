import { supabase as supabaseClient } from '@/integrations/supabase/client';
import type { AuthAPI, BackendAdapter, Session } from './types';

const auth: AuthAPI = {
  async signIn(email, password) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  },
  async signOut() {
    await supabaseClient.auth.signOut();
  },
  async getSession() {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return null;
    return {
      access_token: data.session.access_token,
      user: { id: data.session.user.id, email: data.session.user.email ?? null },
    };
  },
  async getUser() {
    const { data } = await supabaseClient.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  onAuthStateChange(cb) {
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const mapped: Session = session
        ? {
            access_token: session.access_token,
            user: { id: session.user.id, email: session.user.email ?? null },
          }
        : null;
      cb(mapped);
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  },
};

export const supabaseAdapter: BackendAdapter = {
  auth,
  db: supabaseClient,
  async rpc(name, args) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseClient as any).rpc(name, args ?? {});
    return { data: data ?? null, error: error ?? null };
  },
  async invokeFunction(name, options) {
    const { data, error } = await supabaseClient.functions.invoke(name, {
      body: options?.body,
      headers: options?.headers,
    });
    return { data: (data ?? null) as never, error: error ?? null };
  },
};
