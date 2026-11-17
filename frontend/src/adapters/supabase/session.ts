/** Adaptador Supabase da porta de sessão: login aberto pelo backend, cadastro e recuperação. */
import type {
  ProfileRecord,
  SessionGateway,
  SessionListener,
  SignUpOutcome,
  SignUpRequest,
} from '../../application/ports';
import { isSupabaseConfigured, supabase } from './client';

const PROFILE_FIELDS =
  'id,email,full_name,role,grade,goal,registration_status,requested_subject,avatar_key,featured_badge_id,accent_theme,profile_setup_complete,privacy_policy_version,terms_of_use_version';

function client() {
  if (!supabase) throw new Error('Serviço de identidade não configurado.');
  return supabase;
}

export function createSupabaseSession(): SessionGateway {
  return {
    connected: () => isSupabaseConfigured,

    async currentUserId() {
      const { data } = await client().auth.getSession();
      return data.session?.user.id ?? null;
    },

    onChange(listener: SessionListener) {
      const { data } = client().auth.onAuthStateChange((event, session) =>
        listener(event, session?.user.id ?? null),
      );
      return () => data.subscription.unsubscribe();
    },

    async profile(userId: string) {
      const { data, error } = await client()
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .single();
      return error || !data ? null : (data as ProfileRecord);
    },

    async open(accessToken: string, refreshToken: string) {
      const { error } = await client().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return !error;
    },

    async signUp(request: SignUpRequest): Promise<SignUpOutcome> {
      const { data, error } = await client().auth.signUp({
        email: request.email,
        password: request.password,
        options: {
          emailRedirectTo: request.redirectTo,
          captchaToken: request.captchaToken,
          data: request.metadata,
        },
      });
      if (error) {
        return { ok: false, passwordRejected: error.message.toLowerCase().includes('password') };
      }
      return { ok: true, sessionOpened: Boolean(data.session) };
    },

    async requestPasswordRecovery(email: string, redirectTo: string, captchaToken?: string) {
      const { error } = await client().auth.resetPasswordForEmail(email, {
        redirectTo,
        captchaToken,
      });
      return !error;
    },

    async updatePassword(password: string) {
      const { error } = await client().auth.updateUser({ password });
      return !error;
    },

    async signOut() {
      await client().auth.signOut();
    },
  };
}
