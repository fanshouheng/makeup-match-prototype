import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const handlesEmailCallback = typeof window !== "undefined" &&
  !window.location.pathname.startsWith("/admin");

export const accountClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: handlesEmailCallback,
        persistSession: true,
        storageKey: "make-up-plus-auth",
      },
    })
  : undefined;

export function getAccountClient() {
  if (!accountClient) throw new Error("账号服务尚未连接 Supabase");
  return accountClient;
}
