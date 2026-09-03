/**
 * Remote mirror — browse eval runs a colleague pushed to a shared object store
 * (S3 today) alongside your own local ones.
 *
 * The design is deliberately dumb: the shared store is a byte-for-byte mirror
 * of the on-disk layout, and everything the viewer serves keeps coming off the
 * local filesystem. A remote run is *hydrated* into `resultsDir` the first time
 * someone opens it, so bespoke middlewares an app has bolted on (assets, PDFs,
 * traces, …) keep working with no knowledge of S3 at all.
 *
 * Two granularities of fetch, because a single run can carry tens of MB of
 * rendered PDFs and chart assets:
 *
 *   refreshIndex()     every run's run.json + summary.json — kilobytes, so the
 *                      run list can show everyone's runs cheaply.
 *   hydrateRun(runId)  that one run's full tree, once, on first open.
 *
 * Runs are immutable once written, so a sync is always safe to repeat and
 * `--delete` is never passed in either direction.
 *
 * Shelling out to the AWS CLI rather than using the SDK is deliberate: it
 * inherits the developer's SSO session and profile resolution for free, and
 * keeps this package dependency-free.
 */

import { execFile, execFileSync } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_INDEX_TTL_MS = 30_000;

/** Files small enough to pull for *every* run so the list page can render. */
const INDEX_INCLUDES = ["*/run.json", "*/tags.json", "*/*/summary.json"];

/** Account names a container image hands out — they identify the image, not the person. */
const GENERIC_ACCOUNTS = new Set([
  "root",
  "node",
  "vscode",
  "ubuntu",
  "user",
  "devcontainer",
]);

function gitIdentity() {
  for (const key of ["user.email", "user.name"]) {
    try {
      const value = execFileSync("git", ["config", "--get", key], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim();
      if (value) return value;
    } catch {
      /* not a repo, or no git — fall through */
    }
  }
  return null;
}

/**
 * Who is running the viewer — used to decide whether a shared run is yours to
 * delete. Mirrors `evals_viewer_io.share.resolve_user` on the writer side, git
 * fallback included: inside a devcontainer everyone is `node`, so the git
 * identity is the only thing that distinguishes one developer from another.
 */
export function resolveUser() {
  for (const candidate of [
    process.env.EVALS_USER,
    process.env.USER,
    process.env.USERNAME,
    gitIdentity(),
  ]) {
    if (!candidate) continue;
    const slug = candidate
      .split("@")[0]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20);
    if (slug && !GENERIC_ACCOUNTS.has(slug)) return slug;
  }
  return null;
}

/**
 * @param {object} options
 * @param {string} options.url          Shared store root, e.g. "s3://bucket/runs".
 * @param {string} options.resultsDir   Local results dir remote runs hydrate into.
 * @param {string} [options.profile]    AWS profile (default: EVALS_SHARE_PROFILE,
 *                                      then the ambient credential chain).
 * @param {number} [options.indexTtlMs] How long an index refresh is considered
 *                                      fresh (default 30s).
 * @param {string} [options.awsBin]     AWS CLI binary (default "aws").
 * @param {string} [options.user]       Override the local user identity.
 */
export function createRemoteMirror(options) {
  const {
    url,
    resultsDir,
    profile = process.env.EVALS_SHARE_PROFILE || null,
    indexTtlMs = DEFAULT_INDEX_TTL_MS,
    awsBin = process.env.AWS_CLI || "aws",
    user = resolveUser(),
  } = options || {};

  if (!url) throw new Error("createRemoteMirror: url is required");
  if (!resultsDir)
    throw new Error("createRemoteMirror: resultsDir is required");

  const REMOTE = url.replace(/\/+$/, "");
  const LOCAL = resolve(resultsDir);

  let remoteRunIds = new Set();
  let lastIndexedAt = 0;
  let indexInFlight = null;
  let lastError = null;
  const hydrations = new Map();

  async function aws(args, { emptyIsOk = false } = {}) {
    const argv = profile ? [...args, "--profile", profile] : args;
    try {
      const { stdout } = await execFileAsync(awsBin, argv, {
        maxBuffer: 32 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      // `aws s3 ls` exits 1 with no output at all when a prefix holds no
      // objects — which is exactly the state a shared store is in before
      // anyone has pushed a run. That's an empty listing, not a failure.
      if (
        emptyIsOk &&
        err.code === 1 &&
        !err.stdout &&
        !(err.stderr || "").trim()
      ) {
        return "";
      }
      // The CLI puts the useful part (expired SSO session, no such bucket,
      // access denied) on stderr; err.message alone is just the exit code.
      const detail = (err.stderr || err.message || "").trim().split("\n").pop();
      throw new Error(
        err.code === "ENOENT"
          ? `AWS CLI not found (looked for "${awsBin}")`
          : detail || String(err),
      );
    }
  }

  /** Run ids present in the shared store, from a delimiter listing. */
  async function listRemoteRunIds() {
    const stdout = await aws(["s3", "ls", `${REMOTE}/`], { emptyIsOk: true });
    const ids = new Set();
    for (const line of stdout.split("\n")) {
      const m = line.match(/^\s*PRE\s+(.+?)\/\s*$/);
      if (m) ids.add(m[1]);
    }
    return ids;
  }

  async function doRefreshIndex() {
    const args = ["s3", "sync", `${REMOTE}/`, LOCAL, "--exclude", "*"];
    for (const pattern of INDEX_INCLUDES) args.push("--include", pattern);
    args.push("--only-show-errors");

    // List first: if the store is unreachable we want to fail before writing
    // anything, and the id set is what marks a run as shared in the UI.
    remoteRunIds = await listRemoteRunIds();
    await aws(args);
    lastIndexedAt = Date.now();
  }

  /**
   * Pull every run's index files. Debounced by `indexTtlMs` and single-flight,
   * so a page full of parallel requests triggers at most one sync.
   * Never throws — a broken shared store degrades to "local runs only".
   */
  async function refreshIndex({ force = false } = {}) {
    if (!force && Date.now() - lastIndexedAt < indexTtlMs)
      return { ok: !lastError };
    if (indexInFlight) return indexInFlight;

    indexInFlight = doRefreshIndex()
      .then(() => {
        lastError = null;
        return { ok: true };
      })
      .catch((err) => {
        // Only the index sync records a global error: it is the one operation
        // whose failure means "you are seeing local runs only".
        lastError = err.message;
        return { ok: false, error: err.message };
      })
      .finally(() => {
        indexInFlight = null;
      });
    return indexInFlight;
  }

  /**
   * Materialise one run's full tree locally, once per process. Cheap to call on
   * every request: a run already on disk costs one LIST, and a purely local run
   * that isn't in the store syncs nothing.
   */
  async function hydrateRun(runId) {
    if (!runId || runId.includes("/") || runId.includes("..")) return false;
    if (hydrations.has(runId)) return hydrations.get(runId);

    const promise = aws([
      "s3",
      "sync",
      `${REMOTE}/${runId}/`,
      join(LOCAL, runId),
      "--only-show-errors",
    ])
      .then(() => true)
      .catch(() => {
        // Retry on the next request rather than caching a network blip.
        hydrations.delete(runId);
        return false;
      });

    hydrations.set(runId, promise);
    return promise;
  }

  /** Push one file back up — used for the tags sidecar the viewer writes. */
  async function pushFile(runId, relPath) {
    const local = join(LOCAL, runId, relPath);
    if (!existsSync(local)) return false;
    try {
      await aws([
        "s3",
        "cp",
        local,
        `${REMOTE}/${runId}/${relPath}`,
        "--only-show-errors",
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a run from the shared store (only ever called for your own runs). */
  async function deleteRun(runId) {
    await aws([
      "s3",
      "rm",
      `${REMOTE}/${runId}/`,
      "--recursive",
      "--only-show-errors",
    ]);
    remoteRunIds.delete(runId);
    hydrations.delete(runId);
  }

  const isRemote = (runId) => remoteRunIds.has(runId);

  /**
   * Whether the viewer may delete this run outright. Your own shared runs are
   * yours to bin; someone else's are not, and an unattributed one is assumed
   * to predate user stamping rather than to belong to nobody.
   */
  async function canDelete(runId) {
    if (!isRemote(runId)) return true;
    const runJson = join(LOCAL, runId, "run.json");
    if (!existsSync(runJson)) return false;
    try {
      const { user: owner } = JSON.parse(await readFile(runJson, "utf-8"));
      return !owner || !user || owner === user;
    } catch {
      return false;
    }
  }

  return {
    url: REMOTE,
    user,
    refreshIndex,
    hydrateRun,
    pushFile,
    deleteRun,
    isRemote,
    canDelete,
    status: () => ({
      enabled: true,
      url: REMOTE,
      user,
      profile,
      run_count: remoteRunIds.size,
      last_indexed_at: lastIndexedAt
        ? new Date(lastIndexedAt).toISOString()
        : null,
      error: lastError,
    }),
  };
}
