import { supabase } from "./supabase";

const CALLBACK_PREFIX = "mw.wealthgrid.malawimarket://auth/";
const completedCodes = new Set<string>();
const pendingExchanges = new Map<string, Promise<void>>();

export type AuthCallbackType = "google" | "recovery";

export async function processAuthCallback(url: string): Promise<AuthCallbackType | null> {
  if (!url.startsWith(CALLBACK_PREFIX)) return null;

  const isRecovery = url.startsWith(CALLBACK_PREFIX + "reset-password");
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const error = query.get("error_description") || hash.get("error_description") ||
    query.get("error") || hash.get("error");
  if (error) throw new Error(error.replace(/\+/g, " "));

  const code = query.get("code");
  if (code) {
    if (completedCodes.has(code)) return isRecovery ? "recovery" : "google";
    let exchange = pendingExchanges.get(code);
    if (!exchange) {
      exchange = supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) throw exchangeError;
        completedCodes.add(code);
      }).finally(() => pendingExchanges.delete(code));
      pendingExchanges.set(code, exchange);
    }
    await exchange;
  } else {
    const access_token = hash.get("access_token") || query.get("access_token");
    const refresh_token = hash.get("refresh_token") || query.get("refresh_token");
    if (!access_token || !refresh_token) {
      throw new Error("The authentication callback did not contain a valid session code.");
    }
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) throw sessionError;
  }

  return isRecovery ? "recovery" : "google";
}
