<template>
  <component :is="inspectorComponent" />
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useInspectorRegistry } from "../registry.js";

const route = useRoute();
const registry = useInspectorRegistry();

const inspectorComponent = computed(() => {
  return registry.get(route.params.evalName || "");
});
</script>
