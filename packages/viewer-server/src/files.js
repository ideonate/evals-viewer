/**
 * Static file middleware with HTTP Range support — for media referenced by eval
 * results (persisted browser-take videos, snapshots, audio, …). Range matters:
 * without it a <video> can't seek. Path-sandboxed to `dir`.
 *
 * Usually consumed via the plugin's `serveFiles` option (which mounts it *before*
 * the API middleware — that middleware claims every /api/* URL, so a file route
 * registered after it would never be reached):
 *
 *   evalsViewerPlugin({
 *     resultsDir,
 *     serveFiles: [{ prefix: "/api/take-files/", dir: resultsDir }],
 *   })
 *
 * The factory is also exported for hand-mounting:
 *
 *   server.middlewares.use("/api/take-files/", createStaticFilesMiddleware({ dir }));
 */

import { createReadStream, statSync } from "fs";
import { resolve, sep } from "path";

const CONTENT_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp",
  webm: "video/webm", mp4: "video/mp4", vtt: "text/vtt",
  wav: "audio/wav", mp3: "audio/mpeg",
  html: "text/html; charset=utf-8", mhtml: "multipart/related",
  css: "text/css", js: "application/javascript",
  json: "application/json", jsonl: "application/x-ndjson",
  yaml: "text/yaml", yml: "text/yaml", txt: "text/plain; charset=utf-8",
};

function contentType(path) {
  return CONTENT_TYPES[path.split(".").pop()?.toLowerCase()] || "application/octet-stream";
}

/**
 * @param {object} options
 * @param {string} options.dir  Absolute root to serve from (requests are relative
 *                              to the mount prefix and sandboxed to this root).
 * @returns Connect-style middleware for mounting at a path prefix.
 */
export function createStaticFilesMiddleware({ dir }) {
  const root = resolve(dir);
  return (req, res) => {
    const rel = decodeURIComponent((req.url || "").split("?")[0]).replace(/^\/+/, "");
    const abs = resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + sep)) {
      res.statusCode = 403;
      return res.end("forbidden");
    }
    let st;
    try {
      st = statSync(abs);
    } catch {
      res.statusCode = 404;
      return res.end("not found");
    }
    if (!st.isFile()) {
      res.statusCode = 404;
      return res.end("not found");
    }
    res.setHeader("Content-Type", contentType(abs));
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start > end || end >= st.size) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${st.size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
      res.setHeader("Content-Length", end - start + 1);
      return createReadStream(abs, { start, end }).pipe(res);
    }
    res.setHeader("Content-Length", st.size);
    return createReadStream(abs).pipe(res);
  };
}

/** Normalize the plugin's `serveFiles` option: one mount or an array of mounts. */
export function normalizeServeFiles(serveFiles) {
  if (!serveFiles) return [];
  const mounts = Array.isArray(serveFiles) ? serveFiles : [serveFiles];
  return mounts.map(({ prefix = "/api/files/", dir }) => {
    if (!dir) throw new Error("serveFiles: each mount needs a `dir`");
    return { prefix, dir };
  });
}
