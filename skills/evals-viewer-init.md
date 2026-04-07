---
name: evals-viewer-init
description: Use when the user wants to set up the evals-viewer framework in a new or existing project — wiring up @ideonate/evals-viewer-core and @ideonate/evals-viewer-server, creating the Vite config, the AppShell entry point, the inspector and compare auto-discovery folders, and (optionally) the Python evals-viewer-io writer plus pytest fixture. Triggers on phrases like "set up evals viewer," "wire up evals-viewer here," "add the evals viewer to this project."
---

# Setting up evals-viewer in a consumer project

You are scaffolding the evals-viewer framework into the user's project. The framework lives at https://github.com/ideonate/evals-viewer and ships two npm packages and one Python package. Your job is to wire it up, **non-destructively**, then explain the next step.

## Hard rules

1. **Never overwrite existing files without showing the user the diff first.** This includes `package.json`, `vite.config.js`, `conftest.py`, and anything else already on disk. Read → summarize → propose → apply.
2. **Never run `npm audit fix --force`** or any other destructive cleanup as part of setup.
3. **If you find an existing Vite config you don't fully understand, stop and ask** before merging. Don't guess.
4. **Idempotency**: if the project already has parts of the scaffolding (e.g. `src/inspectors/` exists), detect it and skip those steps rather than re-creating.

## Step 1: Discovery

Before doing anything, run these checks in parallel and report back:
- `package.json` — exists? has `vite`? has `vue`? what scripts are defined?
- `vite.config.js` / `vite.config.ts` — exists? what plugins?
- `pyproject.toml` / `setup.py` / `requirements.txt` — exists? Python version?
- `tests/` or `tests/evals/` — exists?
- `src/` — exists? what's in it?
- `.gitignore` — exists?

Then ask the user three questions (one message, not three):
1. Where should eval results be written on disk? (Default: `tests/test-results/evals/`)
2. Do you want the Python writer side too, or just the JS viewer? (Most users want both.)
3. Should I link the npm packages via `file:` (for local iteration on the framework) or via the published versions on npm? (Default: published.)

## Step 2: JavaScript scaffolding

Add to `package.json` dependencies (use the answer from Q3):
```json
{
  "dependencies": {
    "@ideonate/evals-viewer-core": "^0.0.1",
    "@ideonate/evals-viewer-server": "^0.0.1",
    "vue": "^3.4.0",
    "vue-router": "^4.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

If `package.json` already exists, **merge** these in — don't overwrite scripts the user already has, and warn if there are conflicting entries.

Create `vite.config.js` (or merge into existing) with this template, substituting `RESULTS_DIR` from Q1:

```js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import {
  evalsViewerPlugin,
  resolveResultsDir,
  composeLoaders,
  staticCaseInputLoader,
} from "@ideonate/evals-viewer-server";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    evalsViewerPlugin({
      resultsDir: resolveResultsDir({
        envVar: "TEST_RESULTS_FOLDER",
        fallback: resolve(__dirname, "{RESULTS_DIR}"),
      }),
      // evalsDir + caseDataLoader: add later if you need static case
      // fixtures or per-case auxiliary files (assessments, transcripts).
      // See https://github.com/ideonate/evals-viewer for composeLoaders
      // and datasetCaseLoader helpers.
    }),
  ],
  // REQUIRED: force a single instance of vue and vue-router.
  // @ideonate/evals-viewer-core ships raw .vue source, and without this
  // Vite can resolve "vue-router" from inside node_modules differently
  // than from the project root, ending up with two router instances and
  // a useRouter() that returns undefined at click time. Don't omit.
  resolve: {
    dedupe: ["vue", "vue-router"],
  },
});
```

Create `index.html` if missing:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Evals Viewer</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

Create `src/main.js`:

```js
import { createApp, h } from "vue";
import {
  AppShell,
  createEvalsRouter,
  installInspectors,
  installCompares,
} from "@ideonate/evals-viewer-core";
import { inspectors, compares } from "./registry.js";

const app = createApp({
  render: () => h(AppShell, { title: "Evals Viewer" }),
});

app.use(createEvalsRouter());
installInspectors(app, inspectors);
installCompares(app, compares);
app.mount("#app");
```

Create `src/registry.js`:

```js
import { inspectorsFromGlob } from "@ideonate/evals-viewer-core";

// Drop a new file in src/inspectors/{eval_name}.vue → it auto-registers.
export const inspectors = inspectorsFromGlob(
  import.meta.glob("./inspectors/*.vue", { eager: true }),
);

// Drop a new file in src/compares/{eval_name}.vue → it auto-overrides the
// default /compare/case/:caseName view for that eval type.
export const compares = inspectorsFromGlob(
  import.meta.glob("./compares/*.vue", { eager: true }),
);
```

Create empty directories `src/inspectors/` and `src/compares/` (use `.gitkeep` files so they survive `git add`).

## Step 3: Python scaffolding (if Q2 = yes)

Add `evals-viewer-io>=0.0.1` to whichever Python package manifest the project uses (`pyproject.toml` `[project] dependencies`, or `requirements.txt`, etc.). Detect which by reading the existing files; don't invent a new manifest.

If a `conftest.py` doesn't exist at the project root or in `tests/`, create one at `tests/conftest.py`:

```python
"""Pytest fixtures for evals.

The eval_run_dir fixture creates a fresh run directory under
tests/test-results/evals/{run_id}/ and writes a minimal run.json so the
viewer will list the run.
"""

from evals_viewer_io.pytest import eval_run_dir  # noqa: F401
```

If `conftest.py` exists, just append the import line — and warn the user if there's a conflicting fixture name already defined.

Show the user a minimal example of writing eval results from a test:

```python
from evals_viewer_io import EvalSummary, CaseSummary, save_eval_results

def test_my_eval(eval_run_dir):
    # ... run your eval, collect outputs ...
    save_eval_results(
        results_dir=eval_run_dir.parent,
        run_id=eval_run_dir.name,
        eval_name="my_eval",
        summary=EvalSummary(
            aggregates={"Accuracy": {"mean": 0.85, "min": 0.7, "max": 1.0}},
            cases=[CaseSummary(name="case_001", scores={"Accuracy": 0.9})],
        ),
        outputs={"case_001": {"...": "..."}},
    )
```

## Step 4: .gitignore

Append (without duplicating) these entries:
```
node_modules/
dist/
tests/test-results/
```

(Adjust the third line if the user picked a different results dir.)

## Step 5: Verify

Run `npm install` and report whether it succeeded. Do **not** run `npm run dev` yourself — let the user start it. Tell them:

> Setup complete. To start the viewer:
> ```
> npm run dev
> ```
> Then open the printed URL. The viewer will be empty until you have eval results in `{RESULTS_DIR}` — run your tests once and refresh.
>
> To add a custom inspector for a specific eval type, drop `src/inspectors/{eval_name}.vue` into the project. It will auto-register. The `evals-viewer-add-component` skill can scaffold one for you.

## On-disk contract reference

The viewer reads JSON files in this layout. If the user is curious about the format, point them at `docs/data-layout.md` in the evals-viewer repo, or summarise:

```
{resultsDir}/{run_id}/
├── run.json                 (timestamp, git_commit, tags)
└── {eval_name}/
    ├── summary.json         (aggregates + per-case scores/judge_reasons)
    └── outputs/
        └── {case_name}.json (full per-case output)
```

`save_eval_results()` from `evals-viewer-io` produces this layout automatically.
