import { ref, computed, inject, onMounted } from "vue";
import { useRoute } from "vue-router";

/**
 * Injection key for providing case inspector data from a parent component
 * (e.g. CaseCompareView). When provided, the composable skips route-based
 * fetching and uses the injected values instead.
 */
export const CASE_INSPECTOR_DATA = Symbol("caseInspectorData");

/**
 * Shared logic for all case inspector components.
 * Handles route params, data fetching, loading/error state.
 *
 * If CASE_INSPECTOR_DATA is provided by an ancestor, uses that data
 * directly instead of reading route params and fetching from the API.
 */
export function useCaseInspector() {
  const injected = inject(CASE_INSPECTOR_DATA, null);

  if (injected) {
    return {
      route: null,
      loading: computed(() => injected.loading.value),
      error: computed(() => injected.error.value),
      caseData: computed(() => injected.caseData.value),
      runId: computed(() => injected.runId.value),
      evalName: computed(() => injected.evalName.value),
      caseName: computed(() => injected.caseName.value),
      evalType: computed(() => injected.evalName.value),
    };
  }

  const route = useRoute();
  const loading = ref(true);
  const error = ref(null);
  const caseData = ref({});

  const runId = computed(() => route.params.runId);
  const evalName = computed(() => route.params.evalName);
  const caseName = computed(() => route.params.caseName);
  const evalType = computed(() => evalName.value);

  async function fetchCase() {
    try {
      const response = await fetch(
        `/api/evals/${runId.value}/${evalName.value}/case/${caseName.value}`,
      );
      if (!response.ok) throw new Error("Failed to fetch case");
      caseData.value = await response.json();
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchCase);

  return {
    route,
    loading,
    error,
    caseData,
    runId,
    evalName,
    caseName,
    evalType,
  };
}
