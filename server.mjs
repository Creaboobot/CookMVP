import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { handleGenerateRecipeRequest, handleRefineRecipeRequest, handleTranscribeVoiceRequest } from "./src/recipe-api.mjs";

const rootDir = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 3004);

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
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requestedPath);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(rootDir, normalized);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/recipes/generate") {
    const body = await readRequestBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handleGenerateRecipeRequest(request, process.env);
    await sendWebResponse(res, response);
    return;
  }

  if (url.pathname === "/api/recipes/refine") {
    const body = await readRequestBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handleRefineRecipeRequest(request, process.env);
    await sendWebResponse(res, response);
    return;
  }

  if (url.pathname === "/api/voice/transcribe") {
    const body = await readRequestBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handleTranscribeVoiceRequest(request, process.env);
    await sendWebResponse(res, response);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

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
  console.log(`Cookooi is running at http://127.0.0.1:${port}`);
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}
