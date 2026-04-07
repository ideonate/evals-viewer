<template>
  <component :is="compareComponent" />
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useCompareRegistry } from "../registry.js";

const route = useRoute();
const registry = useCompareRegistry();

const compareComponent = computed(() => {
  const runs = route.query.runs || "";
  const firstEval = runs.split(",")[0]?.split(":")[1] || "";
  return registry.get(firstEval);
});
</script>
