import { call } from "./api";
import { API_URL } from "./config";

const SLOT = "wicket.demo-key";

/** A throwaway generated key for the on-page checker: lives in this tab's sessionStorage only (never localStorage). */
export async function demoKey(): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  try {
    const have = sessionStorage.getItem(SLOT);
    if (have) return { ok: true, key: have };
  } catch { /* storage blocked: fall through and mint one per use */ }
  const r = await call<{ key: string }>(API_URL, "/api/keys", undefined, {});
  if (!r.ok) return { ok: false, message: r.error.message };
  try { sessionStorage.setItem(SLOT, r.data.key); } catch { /* fine */ }
  return { ok: true, key: r.data.key };
}

export function forgetDemoKey() {
  try { sessionStorage.removeItem(SLOT); } catch { /* fine */ }
}
