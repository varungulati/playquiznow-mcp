#!/usr/bin/env node
/**
 * PlayQuizNow hosted MCP server (Streamable HTTP).
 *
 * Serves the SAME tools as the stdio npm package, but as a remote endpoint
 * that claude.ai, ChatGPT (developer-mode connectors), Cursor, etc. can call
 * directly — no local install needed.
 *
 *   https://mcp.playquiznow.com/mcp          + Authorization: Bearer pqn_…
 *   https://mcp.playquiznow.com/k/<key>/mcp  (key-in-URL, for clients that
 *                                             can't send custom headers)
 *
 * Stateless mode: every request builds a fresh Server + transport bound to
 * the caller's API key, so one process serves all users with zero shared
 * state. Observability: one JSON line per HTTP request and per tool call
 * (key prefix only — never the full key) to stdout for `docker logs`.
 *
 * Env:
 *   PORT                  — listen port (default 8300)
 *   PLAYQUIZNOW_BASE_URL  — backend API (default https://api.playquiznow.com)
 */

import express from "express"
import type { Request, Response } from "express"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { PlayQuizNowClient } from "./client.js"
import { registerQuizTools } from "./tools/quiz.js"

const PORT = Number(process.env.PORT || 8300)
const BASE_URL = (process.env.PLAYQUIZNOW_BASE_URL ?? "https://api.playquiznow.com").replace(/\/+$/, "")
const MCP_ORIGIN = process.env.MCP_ORIGIN ?? "https://mcp.playquiznow.com"
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://playquiznow.com"
const SERVER_VERSION = "0.8.1"
const startedAt = Date.now()

// OAuth discovery documents. The authorization server lives on the Django
// API; these mirrors exist because MCP clients probe the MCP origin first.
const PROTECTED_RESOURCE_METADATA = {
  resource: `${MCP_ORIGIN}/mcp`,
  authorization_servers: [BASE_URL],
  scopes_supported: ["quizzes"],
  bearer_methods_supported: ["header"],
  resource_documentation: `${FRONTEND_URL}/api-keys`,
}

const AUTHORIZATION_SERVER_METADATA = {
  issuer: BASE_URL,
  authorization_endpoint: `${FRONTEND_URL}/oauth/consent`,
  token_endpoint: `${BASE_URL}/api/oauth/token/`,
  registration_endpoint: `${BASE_URL}/api/oauth/register/`,
  revocation_endpoint: `${BASE_URL}/api/oauth/revoke/`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["quizzes"],
}

const WWW_AUTHENTICATE =
  `Bearer resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource"`

// ---------------------------------------------------------------------------
// Observability: structured JSON lines on stdout + in-memory counters
// ---------------------------------------------------------------------------

const stats = {
  requests: 0,
  tool_calls: 0,
  tool_errors: 0,
  unauthorized: 0,
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))
}

/** First 12 chars (pqn_ + 8) — enough to correlate with the admin dashboard
 * API-key list without ever logging the secret itself. */
function keyTag(apiKey: string): string {
  return apiKey.slice(0, 12)
}

/** Strip key-in-URL segments so logs never contain the full key. */
function redactPath(path: string): string {
  return path.replace(/\/k\/[^/]+/, "/k/<redacted>")
}

// ---------------------------------------------------------------------------
// MCP handling
// ---------------------------------------------------------------------------

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim()
  return null
}

// 60s validity cache so the preflight adds ~zero steady-state latency.
const tokenCache = new Map<string, { valid: boolean; until: number }>()
const TOKEN_CACHE_TTL_MS = 60_000
const TOKEN_CACHE_MAX = 2000

async function isTokenValid(apiKey: string): Promise<boolean> {
  const now = Date.now()
  const cached = tokenCache.get(apiKey)
  if (cached && cached.until > now) return cached.valid
  let valid = false
  try {
    const resp = await fetch(`${BASE_URL}/api/auth/key-check/`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (resp.status === 401 || resp.status === 403) valid = false
    else if (resp.ok) valid = true
    else return true // backend hiccup — don't block the call on it
  } catch {
    return true // network error — fail open, the real call will surface it
  }
  if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.clear()
  tokenCache.set(apiKey, { valid, until: now + TOKEN_CACHE_TTL_MS })
  return valid
}

async function handleMcpRequest(req: Request, res: Response, apiKey: string | null): Promise<void> {
  if (!apiKey || !apiKey.startsWith("pqn_")) {
    stats.unauthorized += 1
    log({ evt: "unauthorized", path: redactPath(req.path), ip: req.ip })
    res.setHeader("WWW-Authenticate", WWW_AUTHENTICATE)
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Missing or invalid PlayQuizNow API key. Send 'Authorization: Bearer pqn_…' " +
          "or use https://mcp.playquiznow.com/k/<your-key>/mcp. " +
          "Get a key at https://playquiznow.com/api-keys",
      },
      id: null,
    })
    return
  }

  // Pre-flight the token for tool calls so an expired/revoked OAuth token
  // (or revoked API key) surfaces as a proper HTTP 401 — that status is what
  // makes clients run token refresh / re-auth. Cached 60s per token.
  const method = (req.body as any)?.method
  if (method === "tools/call" && !(await isTokenValid(apiKey))) {
    stats.unauthorized += 1
    log({ evt: "token_invalid", key: keyTag(apiKey) })
    res.setHeader("WWW-Authenticate", WWW_AUTHENTICATE)
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Token expired or revoked — re-authenticate." },
      id: null,
    })
    return
  }

  const tag = keyTag(apiKey)
  const server = new Server(
    { name: "playquiznow", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )
  const client = new PlayQuizNowClient(BASE_URL, apiKey)
  registerQuizTools(server, client, (info) => {
    stats.tool_calls += 1
    if (!info.ok) stats.tool_errors += 1
    log({ evt: "tool_call", key: tag, ...info })
  })

  // Stateless: no session ids — each POST is self-contained.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on("close", () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()
app.set("trust proxy", true) // behind host nginx
app.use(express.json({ limit: "4mb" }))

// CORS: some MCP clients run in browsers. No credentials, headers only.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  )
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id")
  if (req.method === "OPTIONS") {
    res.sendStatus(204)
    return
  }
  next()
})

// Request log (status + latency) — skips /health noise.
app.use((req, res, next) => {
  if (req.path === "/health") {
    next()
    return
  }
  const t0 = Date.now()
  stats.requests += 1
  res.on("finish", () => {
    log({
      evt: "http",
      method: req.method,
      path: redactPath(req.path),
      status: res.statusCode,
      ms: Date.now() - t0,
    })
  })
  next()
})

// OAuth discovery (clients probe the MCP origin for these)
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(PROTECTED_RESOURCE_METADATA)
})
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(AUTHORIZATION_SERVER_METADATA)
})

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: SERVER_VERSION,
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    backend: BASE_URL,
    ...stats,
  })
})

// Main endpoint: Authorization header carries the key.
app.post("/mcp", (req, res) => {
  void handleMcpRequest(req, res, extractBearer(req))
})

// Key-in-URL variant for clients without custom-header support
// (claude.ai / ChatGPT custom connectors). The URL itself is the secret.
app.post("/k/:key/mcp", (req, res) => {
  void handleMcpRequest(req, res, extractBearer(req) ?? req.params.key)
})

// Stateless server: no SSE resumption, no sessions to delete.
app.get(["/mcp", "/k/:key/mcp"], (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: stateless server, POST only." },
    id: null,
  })
})
app.delete(["/mcp", "/k/:key/mcp"], (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: stateless server, POST only." },
    id: null,
  })
})

// Friendly root for humans who open the URL in a browser.
app.get("/", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "PlayQuizNow MCP server\n\n" +
        "Connect from claude.ai / ChatGPT / Cursor:\n" +
        "  URL:  https://mcp.playquiznow.com/mcp   (OAuth — sign in when prompted)\n" +
        "  or:   https://mcp.playquiznow.com/k/<your-api-key>/mcp\n\n" +
        "Get an API key: https://playquiznow.com/api-keys\n" +
        "Docs: https://playquiznow.com/integrations/mcp\n",
    )
})

app.listen(PORT, () => {
  log({ evt: "start", port: PORT, backend: BASE_URL, version: SERVER_VERSION })
})
