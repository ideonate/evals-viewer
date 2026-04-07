import { inject } from "vue";
import GenericCaseInspector from "./components/GenericCaseInspector.vue";

/**
 * Inspector registry: maps eval name (string) -> Vue component.
 *
 * Apps build their own map and pass it to `createEvalsViewer({ inspectors })`
 * (or provide directly via `app.provide(INSPECTOR_REGISTRY, registry)`).
 *
 * Falls back to the bundled GenericCaseInspector for unknown eval types.
 */
export const INSPECTOR_REGISTRY = Symbol("inspectorRegistry");

export function createInspectorRegistry(inspectorMap = {}) {
  return {
    get(evalName) {
      return inspectorMap[evalName] || GenericCaseInspector;
    },
    has(evalName) {
      return Object.prototype.hasOwnProperty.call(inspectorMap, evalName);
    },
    map: inspectorMap,
  };
}

export function useInspectorRegistry() {
  const registry = inject(INSPECTOR_REGISTRY, null);
  if (!registry) {
    return createInspectorRegistry({});
  }
  return registry;
}
