/**
 * Reusable building blocks for assembling a `caseDataLoader`.
 *
 *   import {
 *     composeLoaders,
 *     staticCaseInputLoader,
 *     datasetCaseLoader,
 *     resolveResultsDir,
 *   } from "@evals-viewer/server";
 */

import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

/**
 * Resolve a results directory from an env var, falling back to a default.
 *
 *   resolveResultsDir({ envVar: "TEST_RESULTS_FOLDER", fallback: "./results" })
 *
 * If the env var is set, the loader appends "evals" to it (matching the
 * convention that the env var points at the parent test-results dir).
 */
export function resolveResultsDir({ envVar, fallback, suffix = "evals" } = {}) {
  if (envVar && process.env[envVar]) {
    return suffix ? join(process.env[envVar], suffix) : process.env[envVar];
  }
  return fallback;
}

/**
 * Compose multiple async loaders into a single caseDataLoader.
 *
 * Loaders run in order; their returned objects are shallow-merged (later
 * loaders win on key collision). A loader that throws does not abort the
 * chain — its error is attached as `_caseDataLoaderError` instead.
 */
export function composeLoaders(...loaders) {
  return async function composed(ctx) {
    let merged = {};
    for (const loader of loaders) {
      try {
        const result = await loader(ctx);
        if (result && typeof result === "object") {
          merged = { ...merged, ...result };
        }
      } catch (err) {
        merged._caseDataLoaderError = err.message;
      }
    }
    return merged;
  };
}

/**
 * Loader that returns `{ caseInput }` from
 * `{evalsDir}/{evalName}/data/cases/{caseName}.json` if present.
 */
export function staticCaseInputLoader() {
  return async function ({ evalName, caseName, evalsDir }) {
    if (!evalsDir) return null;
    const path = join(evalsDir, evalName, "data", "cases", `${caseName}.json`);
    if (!existsSync(path)) return null;
    try {
      return { caseInput: await readJson(path) };
    } catch {
      return null;
    }
  };
}

/**
 * Loader for the "case = dataset_person" convention.
 *
 * Parses `caseName` against the subdirectories of
 * `{evalsDir}/{evalName}/data/`. Longest-prefix wins so that names with
 * underscores work correctly (e.g. "agile_health_check_alice" with a
 * dataset named "agile_health_check"). Then loads any per-dataset files
 * named in `files`, where keys become response keys and values are paths
 * relative to the dataset dir, with `{person}` and `{dataset}` interpolated.
 *
 *   datasetCaseLoader({
 *     files: {
 *       assessment: "assessment.json",
 *       transcript: "transcripts/{person}.json",
 *     },
 *   })
 *
 * Returns `{ dataset, person, ...files }` (only including files that loaded
 * successfully).
 */
export function datasetCaseLoader({ files = {} } = {}) {
  return async function ({ evalName, caseName, evalsDir }) {
    if (!evalsDir) return null;

    const dataDir = join(evalsDir, evalName, "data");
    if (!existsSync(dataDir)) return null;

    let datasets;
    try {
      const entries = await readdir(dataDir, { withFileTypes: true });
      datasets = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
        .map((e) => e.name)
        .sort((a, b) => b.length - a.length);
    } catch {
      return null;
    }

    let dataset = null;
    let person = null;
    for (const ds of datasets) {
      if (caseName.startsWith(ds + "_")) {
        dataset = ds;
        person = caseName.slice(ds.length + 1);
        break;
      }
    }
    if (!dataset) return null;

    const result = { dataset, person };

    for (const [key, template] of Object.entries(files)) {
      const relPath = template
        .replace(/\{person\}/g, person)
        .replace(/\{dataset\}/g, dataset);
      const fullPath = join(dataDir, dataset, relPath);
      if (!existsSync(fullPath)) continue;
      try {
        result[key] = await readJson(fullPath);
      } catch {
        /* skip files that fail to parse */
      }
    }

    return result;
  };
}
