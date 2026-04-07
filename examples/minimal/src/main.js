import { createApp, h } from "vue";
import {
  AppShell,
  createEvalsRouter,
  installInspectors,
} from "@evals-viewer/core";
import HelloInspector from "./inspectors/HelloInspector.vue";

const app = createApp({
  render: () => h(AppShell, { title: "Evals Viewer — Minimal" }),
});

app.use(createEvalsRouter());
installInspectors(app, {
  hello: HelloInspector,
});
app.mount("#app");
