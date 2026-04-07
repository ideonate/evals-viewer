import { createRouter, createWebHistory } from "vue-router";
import EvalsList from "./components/EvalsList.vue";
import EvalDetail from "./components/EvalDetail.vue";
import CaseInspectorRouter from "./components/CaseInspectorRouter.vue";
import CompareEvals from "./components/CompareEvals.vue";
import CaseCompareRouter from "./components/CaseCompareRouter.vue";

/**
 * Build the standard evals viewer router.
 *
 * Apps may pass `extraRoutes` to register their own (e.g. a domain-specific
 * CaseCompare implementation).
 */
export function createEvalsRouter({ history, extraRoutes = [] } = {}) {
  // extraRoutes are prepended so apps can override any default route
  // (e.g. /compare/case/:caseName) by registering the same path.
  const routes = [
    ...extraRoutes,
    { path: "/", component: EvalsList },
    { path: "/eval/:runId/:evalName", component: EvalDetail },
    {
      path: "/eval/:runId/:evalName/case/:caseName",
      component: CaseInspectorRouter,
    },
    { path: "/compare", component: CompareEvals },
    { path: "/compare/case/:caseName", component: CaseCompareRouter },
  ];

  return createRouter({
    history: history || createWebHistory(),
    routes,
  });
}
