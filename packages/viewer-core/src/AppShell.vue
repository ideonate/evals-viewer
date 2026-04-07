<template>
  <div class="app">
    <header class="header">
      <router-link to="/" class="logo">{{ title }}</router-link>
    </header>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: "Evals Viewer" },
});
</script>

<style>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.header { background: #2c3e50; padding: 1rem 2rem; color: white; }
.logo { color: white; text-decoration: none; font-size: 1.25rem; font-weight: 600; }
.main { flex: 1; padding: 2rem; max-width: 1400px; margin: 0 auto; width: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f5f6f8; color: #222; }
</style>
