/**
 * Evals Viewer API — filesystem-backed middleware factory.
 *
 * Public on-disk contract (see docs/data-layout.md):
 *
 *   {resultsDir}/{run_id}/run.json                    - run metadata
 *   {resultsDir}/{run_id}/{eval_name}/summary.json    - eval summary + per-case rows
 *   {resultsDir}/{run_id}/{eval_name}/outputs/{case}.json
 *   {resultsDir}/{run_id}/{eval_name}/case-scores/{case}.json   (optional)
 *   {resultsDir}/{run_id}/{eval_name}/inputs/{case}.json        (optional)
 *   {resultsDir}/{run_id}/tags.json                   (sidecar, user tags)
 *
 *   {evalsDir}/{eval_name}/data/...                   (optional, per-app static
 *                                                      case input data — apps
 *                                                      provide caseDataLoader
 *                                                      to extract domain extras)
 */

import { readFile, readdir, rm, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { join, resolve, normalize } from "path";

async function readJson(path) {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content);
}

function jsonResponse(res, data, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function errorResponse(res, message, statusCode = 500) {
  jsonResponse(res, { error: message }, statusCode);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Create the evals viewer middleware.
 *
 * @param {object} options
 * @param {string} options.resultsDir   Absolute path to the eval results root.
 * @param {string} [options.evalsDir]   Optional absolute path to static eval
 *                                      data (per-app input fixtures, etc).
 * @param {(ctx: {evalName: string, caseName: string, evalDir: string,
 *            evalsDir: string|null}) => Promise<object>} [options.caseDataLoader]
 *           Optional async hook returning extra fields to merge into the case
 *           detail response (e.g. assessment, transcript). Lets apps inject
 *           domain-specific input loading without forking the server.
 */
export function createEvalsApiMiddleware(options) {
  const {
    resultsDir,
    evalsDir = null,
    caseDataLoader = null,
  } = options || {};

  if (!resultsDir) {
    throw new Error("createEvalsApiMiddleware: resultsDir is required");
  }

  const RESULTS_DIR = resolve(resultsDir);
  const EVALS_DIR = evalsDir ? resolve(evalsDir) : null;

  function resolveRunDir(runId) {
    const runDir = resolve(RESULTS_DIR, runId);
    if (!normalize(runDir).startsWith(normalize(RESULTS_DIR))) {
      return null;
    }
    return runDir;
  }

  async function loadUserTags(runDir) {
    const tagsPath = join(runDir, "tags.json");
    if (!existsSync(tagsPath)) return [];
    try {
      return await readJson(tagsPath);
    } catch {
      return [];
    }
  }

  async function listRuns() {
    if (!existsSync(RESULTS_DIR)) return [];
    const entries = await readdir(RESULTS_DIR, { withFileTypes: true });
    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const runJsonPath = join(RESULTS_DIR, entry.name, "run.json");
      if (!existsSync(runJsonPath)) continue;
      runs.push(entry.name);
    }
    return runs;
  }

  async function listEvalsInRun(runId) {
    const runDir = join(RESULTS_DIR, runId);
    const entries = await readdir(runDir, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isDirectory() && existsSync(join(runDir, e.name, "summary.json")),
      )
      .map((e) => e.name);
  }

  async function loadCaseInput(evalName, caseName, evalDir) {
    // Optional run-level inputs (saved during eval execution)
    const runPath = join(evalDir, "inputs", `${caseName}.json`);
    if (existsSync(runPath)) {
      try {
        return await readJson(runPath);
      } catch {
        // fall through
      }
    }
    return null;
  }

  async function handleListEvals(req, res) {
    try {
      const runIds = await listRuns();
      const runs = [];
      for (const runId of runIds) {
        let runMeta = {};
        try {
          runMeta = await readJson(join(RESULTS_DIR, runId, "run.json"));
        } catch {
          /* ignore */
        }
        const evalNames = await listEvalsInRun(runId);
        const evals = [];
        for (const evalName of evalNames) {
          const summaryPath = join(
            RESULTS_DIR,
            runId,
            evalName,
            "summary.json",
          );
          try {
            const summary = await readJson(summaryPath);
            const cases = summary.cases || [];
            const errorCount = cases.filter((c) => c.success === false).length;
            evals.push({
              name: evalName,
              case_count: cases.length,
              error_count: errorCount,
              aggregates: summary.aggregates || {},
            });
          } catch {
            evals.push({ name: evalName, case_count: 0, aggregates: {} });
          }
        }
        const userTags = await loadUserTags(join(RESULTS_DIR, runId));
        const allTags = [...(runMeta.tags || []), ...userTags];
        runs.push({
          run_id: runId,
          timestamp: runMeta.timestamp || null,
          git_commit: runMeta.git_commit || null,
          git_branch: runMeta.git_branch || null,
          git_dirty: runMeta.git_dirty || false,
          tags: allTags,
          user_tags: userTags,
          evals,
        });
      }
      runs.sort((a, b) => {
        if (a.timestamp && b.timestamp)
          return b.timestamp.localeCompare(a.timestamp);
        if (a.timestamp) return -1;
        if (b.timestamp) return 1;
        return 0;
      });
      jsonResponse(res, runs);
    } catch (err) {
      errorResponse(res, `Error listing evals: ${err.message}`);
    }
  }

  async function handleGetEvalSummary(req, res, runId, evalName) {
    const summaryPath = join(RESULTS_DIR, runId, evalName, "summary.json");
    if (!existsSync(summaryPath)) {
      return errorResponse(res, `Eval '${runId}/${evalName}' not found`, 404);
    }
    try {
      jsonResponse(res, await readJson(summaryPath));
    } catch (err) {
      errorResponse(res, `Error reading summary: ${err.message}`);
    }
  }

  async function handleGetCaseDetail(req, res, runId, evalName, caseName) {
    const evalDir = join(RESULTS_DIR, runId, evalName);
    const outputPath = join(evalDir, "outputs", `${caseName}.json`);
    if (!existsSync(outputPath)) {
      return errorResponse(res, `Case '${caseName}' not found`, 404);
    }
    try {
      const output = await readJson(outputPath);

      let scores = null;
      let integrity = null;
      let judgeReasons = null;
      let questionScores = null;

      const summaryPath = join(evalDir, "summary.json");
      if (existsSync(summaryPath)) {
        try {
          const summary = await readJson(summaryPath);
          const caseEntry = (summary.cases || []).find(
            (c) => c.name === caseName,
          );
          if (caseEntry) {
            if (caseEntry.scores) scores = caseEntry.scores;
            if (caseEntry.integrity) integrity = caseEntry.integrity;
            if (caseEntry.judge_reasons) judgeReasons = caseEntry.judge_reasons;
          }
        } catch {
          /* ignore */
        }
      }

      const questionScoresPath = join(
        evalDir,
        "case-scores",
        `${caseName}.json`,
      );
      if (existsSync(questionScoresPath)) {
        try {
          questionScores = await readJson(questionScoresPath);
        } catch {
          /* ignore */
        }
      }

      const caseInput = await loadCaseInput(evalName, caseName, evalDir);

      // Optional app-supplied hook for domain extras (assessment, transcript, ...)
      let extras = {};
      if (caseDataLoader) {
        try {
          extras =
            (await caseDataLoader({
              evalName,
              caseName,
              evalDir,
              evalsDir: EVALS_DIR,
            })) || {};
        } catch (err) {
          // Don't fail the whole request because the loader threw
          extras = { _caseDataLoaderError: err.message };
        }
      }

      jsonResponse(res, {
        eval_type: evalName,
        case_name: caseName,
        output,
        caseInput,
        scores,
        integrity,
        questionScores,
        judgeReasons,
        ...extras,
      });
    } catch (err) {
      errorResponse(res, `Error reading case: ${err.message}`);
    }
  }

  async function handleAddTag(req, res, runId) {
    const runDir = resolveRunDir(runId);
    if (!runDir) return errorResponse(res, "Invalid run ID", 400);
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
      return errorResponse(res, `Run '${runId}' not found`, 404);
    }
    try {
      const body = await readRequestBody(req);
      const { tag } = JSON.parse(body);
      if (!tag || typeof tag !== "string") {
        return errorResponse(res, "Missing or invalid 'tag' field", 400);
      }
      const trimmed = tag.trim();
      if (!trimmed) return errorResponse(res, "Tag cannot be empty", 400);

      const tags = await loadUserTags(runDir);
      if (!tags.includes(trimmed)) {
        tags.push(trimmed);
        await writeFile(
          join(runDir, "tags.json"),
          JSON.stringify(tags, null, 2),
        );
      }
      jsonResponse(res, { tags });
    } catch (err) {
      errorResponse(res, `Error adding tag: ${err.message}`);
    }
  }

  async function handleDeleteTag(req, res, runId, tag) {
    const runDir = resolveRunDir(runId);
    if (!runDir) return errorResponse(res, "Invalid run ID", 400);
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
      return errorResponse(res, `Run '${runId}' not found`, 404);
    }
    try {
      let tags = await loadUserTags(runDir);
      tags = tags.filter((t) => t !== tag);
      await writeFile(join(runDir, "tags.json"), JSON.stringify(tags, null, 2));
      jsonResponse(res, { tags });
    } catch (err) {
      errorResponse(res, `Error removing tag: ${err.message}`);
    }
  }

  async function handleDeleteRun(req, res, runId) {
    const runDir = resolveRunDir(runId);
    if (!runDir) return errorResponse(res, "Invalid run ID", 400);
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
      return errorResponse(res, `Run '${runId}' not found`, 404);
    }
    try {
      await rm(runDir, { recursive: true, force: true });
      jsonResponse(res, { deleted: runId });
    } catch (err) {
      errorResponse(res, `Error deleting run: ${err.message}`);
    }
  }

  return function evalsApiMiddleware(req, res, next) {
    const url = req.url || "";
    if (!url.startsWith("/api")) return next();
    const path = url.split("?")[0];

    if (path === "/api/evals" && req.method === "GET") {
      return handleListEvals(req, res);
    }

    const addTagMatch = path.match(/^\/api\/evals\/([^/]+)\/tags$/);
    if (addTagMatch && req.method === "POST") {
      return handleAddTag(req, res, decodeURIComponent(addTagMatch[1]));
    }

    const deleteTagMatch = path.match(/^\/api\/evals\/([^/]+)\/tags\/([^/]+)$/);
    if (deleteTagMatch && req.method === "DELETE") {
      return handleDeleteTag(
        req,
        res,
        decodeURIComponent(deleteTagMatch[1]),
        decodeURIComponent(deleteTagMatch[2]),
      );
    }

    const deleteMatch = path.match(/^\/api\/evals\/([^/]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      return handleDeleteRun(req, res, decodeURIComponent(deleteMatch[1]));
    }

    const summaryMatch = path.match(/^\/api\/evals\/([^/]+)\/([^/]+)\/summary$/);
    if (summaryMatch) {
      return handleGetEvalSummary(
        req,
        res,
        decodeURIComponent(summaryMatch[1]),
        decodeURIComponent(summaryMatch[2]),
      );
    }

    const caseMatch = path.match(
      /^\/api\/evals\/([^/]+)\/([^/]+)\/case\/([^/]+)$/,
    );
    if (caseMatch) {
      return handleGetCaseDetail(
        req,
        res,
        decodeURIComponent(caseMatch[1]),
        decodeURIComponent(caseMatch[2]),
        decodeURIComponent(caseMatch[3]),
      );
    }

    errorResponse(res, "Not found", 404);
  };
}
