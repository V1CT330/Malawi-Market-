import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// These are public client credentials. Row Level Security protects marketplace data.
export const supabase = createClient(
  "https://fbkzzqzwxsnuvkszrcxq.supabase.co",
  "sb_publishable_72VuqamY6imCmKqSV2jiVg_nrjg2y92",
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  }
);
