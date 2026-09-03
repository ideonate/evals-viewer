import { ref } from "vue";

/**
 * Shared-store status, fetched once per page load and shared by every caller
 * (module-level ref = singleton, so the header and the run list don't each
 * hit the endpoint).
 *
 * `enabled` is false when the server has no shared store configured — the
 * common case for someone who hasn't opted in — but `user` is reported either
 * way, since knowing which identity the viewer is running as is useful even
 * with sharing off.
 */
const status = ref({ enabled: false, user: null });
let fetched = false;

async function load() {
  try {
    const response = await fetch("/api/remote");
    if (response.ok) status.value = await response.json();
  } catch {
    // A server without the remote routes is just a local-only viewer.
  }
}

export function useRemoteStatus() {
  /** Fetch once per page load unless `force` asks for a re-read. */
  async function refresh({ force = false } = {}) {
    if (fetched && !force) return status.value;
    fetched = true;
    await load();
    return status.value;
  }

  /** Ask the server to re-sync from the store, then adopt the new status. */
  async function syncNow() {
    try {
      const response = await fetch("/api/remote/refresh", { method: "POST" });
      if (response.ok) status.value = await response.json();
    } catch {
      /* leave the previous status in place */
    }
    return status.value;
  }

  return { status, refresh, syncNow };
}
