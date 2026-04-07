import { inject } from "vue";
import GenericCaseInspector from "./components/GenericCaseInspector.vue";
import CaseCompareView from "./components/CaseCompareView.vue";

/**
 * Inspector registry: maps eval name (string) -> Vue component.
 *
 * Apps build their own map and pass it to `installInspectors(app, map)`
 * (or provide directly via `app.provide(INSPECTOR_REGISTRY, registry)`).
 *
 * Falls back to the bundled GenericCaseInspector for unknown eval types.
 */
export const INSPECTOR_REGISTRY = Symbol("inspectorRegistry");
export const COMPARE_REGISTRY = Symbol("compareRegistry");

function makeRegistry(map, fallback) {
  return {
    get(evalName) {
      return map[evalName] || fallback;
    },
    has(evalName) {
      return Object.prototype.hasOwnProperty.call(map, evalName);
    },
    map,
  };
}

export function createInspectorRegistry(inspectorMap = {}) {
  return makeRegistry(inspectorMap, GenericCaseInspector);
}

export function createCompareRegistry(compareMap = {}) {
  return makeRegistry(compareMap, CaseCompareView);
}

/**
 * Convert a Vite glob import result into an inspector map.
 *
 * Convention: each file's basename (without .vue) is the eval name.
 *
 *   import { inspectorsFromGlob } from "@evals-viewer/core";
 *   export const inspectors = inspectorsFromGlob(
 *     import.meta.glob("./inspectors/*.vue", { eager: true }),
 *   );
 */
export function inspectorsFromGlob(globResult) {
  const out = {};
  for (const [path, mod] of Object.entries(globResult)) {
    const match = path.match(/\/([^/]+)\.vue$/);
    if (!match) continue;
    out[match[1]] = mod.default || mod;
  }
  return out;
}

export function useInspectorRegistry() {
  return inject(INSPECTOR_REGISTRY, null) || createInspectorRegistry({});
}

export function useCompareRegistry() {
  return inject(COMPARE_REGISTRY, null) || createCompareRegistry({});
}
