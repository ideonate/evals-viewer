# evals-viewer

A lightweight, configurable viewer for LLM evaluation results. Apps plug in their own Vue inspector components to render eval-specific case data.

## Packages

This is a polyglot repo. The JS packages share an npm workspaces root at the top level (hence the `package.json` here); the Python package is self-contained under its own directory and is installed independently with pip/uv.

**JavaScript (npm)** — under `packages/viewer-*`, linked together via npm workspaces:
- `@evals-viewer/core` — Vue 3 components, composables, router factory, inspector registry
- `@evals-viewer/server` — Vite plugin exposing the filesystem-backed eval API

**Python (pypi)** — under `packages/pydantic-evals-io/`, install with `pip install -e packages/pydantic-evals-io`:
- `evals-viewer-io` — Pydantic schemas and a writer for the on-disk eval result format

## Layout

```
packages/
  viewer-core/        # @evals-viewer/core
  viewer-server/      # @evals-viewer/server
  pydantic-evals-io/  # evals-viewer-io (pypi)
examples/
  minimal/            # smallest possible consumer app
docs/
  data-layout.md      # the on-disk contract between writer and viewer
```

## Status

Pre-alpha extraction in progress. See `docs/data-layout.md` for the on-disk contract that's the real public API.
