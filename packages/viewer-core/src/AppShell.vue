<template>
  <div class="app">
    <header class="header">
      <router-link to="/" class="logo">{{ title }}</router-link>
      <span v-if="status.user" class="whoami" :title="whoamiTitle">
        <span v-if="status.enabled" class="whoami-icon">☁</span>
        {{ status.user }}
      </span>
    </header>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRemoteStatus } from "./composables/useRemoteStatus.js";

defineProps({
  title: { type: String, default: "Evals Viewer" },
});

// Which identity this viewer is running as — the name your own runs get
// stamped with, and what decides whose shared runs you may delete. Worth
// showing at all times: it is easy to forget you started this instance with
// EVALS_USER set to someone else.
const { status, refresh } = useRemoteStatus();

const whoamiTitle = computed(() =>
  status.value.enabled
    ? `Running as ${status.value.user} — sharing with ${status.value.url}`
    : `Running as ${status.value.user} — sharing off`,
);

onMounted(refresh);
</script>

<style>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  background: #2c3e50;
  padding: 1rem 2rem;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.whoami {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #dbe6f0;
  background: rgba(255, 255, 255, 0.12);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}
.whoami-icon {
  opacity: 0.75;
}
.logo {
  color: white;
  text-decoration: none;
  font-size: 1.25rem;
  font-weight: 600;
}
.main {
  flex: 1;
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  background: #f5f6f8;
  color: #222;
}
</style>
