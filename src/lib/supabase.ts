import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

// These are public client credentials. Row Level Security protects all marketplace data.
export const supabase = createClient(
  "https://fbkzzqzwxsnuvkszrcxq.supabase.co",
  "sb_publishable_72VuqamY6imCmKqSV2jiVg_nrjg2y92",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
