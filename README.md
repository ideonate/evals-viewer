# evals-viewer

A lightweight, configurable viewer for LLM evaluation results. Apps plug in their own Vue inspector components to render eval-specific case data.

## Packages

This is a polyglot repo. The JS packages share an npm workspaces root at the top level (hence the `package.json` here); the Python package is self-contained under its own directory and is installed independently with pip/uv.

**JavaScript (npm)** — under `packages/viewer-*`, linked together via npm workspaces:
- `@ideonate/evals-viewer-core` — Vue 3 components, composables, router factory, inspector registry
- `@ideonate/evals-viewer-server` — Vite plugin exposing the filesystem-backed eval API

**Python (pypi)** — under `packages/pydantic-evals-io/`, install with `pip install -e packages/pydantic-evals-io`:
- `evals-viewer-io` — Pydantic schemas and a writer for the on-disk eval result format

## Layout

```
packages/
  viewer-core/        # @ideonate/evals-viewer-core
  viewer-server/      # @ideonate/evals-viewer-server
  pydantic-evals-io/  # evals-viewer-io (pypi)
examples/
  minimal/            # smallest possible consumer app
docs/
  data-layout.md      # the on-disk contract between writer and viewer
```

## Using with Claude Code

This repo ships two Claude Code skills under `skills/` to scaffold the framework into a consumer project:

- `evals-viewer-init` — wires up the JS side (Vite plugin, AppShell entry point, auto-discovery folders) and optionally the Python writer side (`evals-viewer-io` + pytest fixture). Triggers on phrases like "set up evals viewer in this project."
- `evals-viewer-add-component` — scaffolds a new inspector or compare view for one specific eval type. Triggers on phrases like "add an inspector for my X eval."

To install them in a consumer project, copy the markdown files into that project's `.claude/skills/` directory:

```sh
mkdir -p /path/to/your-project/.claude/skills
cp skills/*.md /path/to/your-project/.claude/skills/
```

Both skills are deliberately non-destructive: they read existing files, propose diffs, and never overwrite without showing the user first.

## Status

Pre-alpha extraction in progress. See `docs/data-layout.md` for the on-disk contract that's the real public API.
