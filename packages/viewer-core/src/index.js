// Public API for @evals-viewer/core

export { createEvalsRouter } from "./router.js";
export {
  INSPECTOR_REGISTRY,
  COMPARE_REGISTRY,
  createInspectorRegistry,
  createCompareRegistry,
  inspectorsFromGlob,
  useInspectorRegistry,
  useCompareRegistry,
} from "./registry.js";
export {
  CASE_INSPECTOR_DATA,
  useCaseInspector,
} from "./composables/useCaseInspector.js";
export * from "./utils/evalHelpers.js";

export { default as AppShell } from "./AppShell.vue";
export { default as CaseInspectorLayout } from "./components/CaseInspectorLayout.vue";
export { default as CaseInspectorRouter } from "./components/CaseInspectorRouter.vue";
export { default as GenericCaseInspector } from "./components/GenericCaseInspector.vue";
export { default as InspectorProvider } from "./components/InspectorProvider.vue";
export { default as EvalCard } from "./components/EvalCard.vue";
export { default as EvalsList } from "./components/EvalsList.vue";
export { default as EvalDetail } from "./components/EvalDetail.vue";
export { default as CompareEvals } from "./components/CompareEvals.vue";
export { default as CaseCompareView } from "./components/CaseCompareView.vue";
export { default as CaseCompareRouter } from "./components/CaseCompareRouter.vue";

/**
 * Convenience: install the inspector registry on a Vue app.
 *
 * Usage:
 *   import { createApp } from "vue";
 *   import { createEvalsRouter, installInspectors } from "@evals-viewer/core";
 *   const app = createApp(App);
 *   app.use(createEvalsRouter());
 *   installInspectors(app, { my_eval: MyInspector });
 */
import {
  createInspectorRegistry,
  createCompareRegistry,
  INSPECTOR_REGISTRY,
  COMPARE_REGISTRY,
} from "./registry.js";

export function installInspectors(app, inspectorMap) {
  app.provide(INSPECTOR_REGISTRY, createInspectorRegistry(inspectorMap));
}

export function installCompares(app, compareMap) {
  app.provide(COMPARE_REGISTRY, createCompareRegistry(compareMap));
}
