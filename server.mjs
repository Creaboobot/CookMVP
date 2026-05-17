import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3002);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function filePathForRequest(pathname) {
  const requestedPath = pathname === "/" ? "/recipe.html" : pathname;
  const decoded = decodeURIComponent(requestedPath);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(rootDir, normalized);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const filePath = filePathForRequest(url.pathname);

  if (!filePath.startsWith(rootDir)) {
    send(res, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
      return;
    }

    res.writeHead(200, {
      "cache-control": "no-store",
      "content-length": fileStat.size,
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
  }
});

server.listen(port, () => {
  console.log(`CookMVP is running at http://127.0.0.1:${port}`);
});
