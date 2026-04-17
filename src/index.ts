#!/usr/bin/env node
/**
 * PlayQuizNow MCP Server (Node.js edition).
 *
 * Zero-install entry: run via `npx -y playquiznow-mcp`.
 *
 * Configuration via environment variables:
 *   PLAYQUIZNOW_API_KEY  — Required. Your PlayQuizNow API key (starts with pqn_).
 *   PLAYQUIZNOW_BASE_URL — Optional. Defaults to https://api.playquiznow.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { PlayQuizNowClient } from "./client.js"
import { registerQuizTools } from "./tools/quiz.js"

const DEFAULT_BASE_URL = "https://api.playquiznow.com"

async function main(): Promise<void> {
  const apiKey = process.env.PLAYQUIZNOW_API_KEY ?? ""
  const baseUrl = process.env.PLAYQUIZNOW_BASE_URL ?? DEFAULT_BASE_URL

  if (!apiKey) {
    process.stderr.write(
      "Error: PLAYQUIZNOW_API_KEY environment variable is required.\n" +
        "Generate one at https://playquiznow.com/api-keys\n",
    )
    process.exit(1)
  }

  if (!apiKey.startsWith("pqn_")) {
    process.stderr.write("Warning: API key does not start with 'pqn_' — verify it's a valid PlayQuizNow key\n")
  }

  process.stderr.write(`Starting PlayQuizNow MCP server (base_url=${baseUrl})\n`)

  const server = new Server(
    { name: "playquiznow", version: "0.1.0" },
    { capabilities: { tools: {} } },
  )
  const client = new PlayQuizNowClient(baseUrl, apiKey)
  registerQuizTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e?.message ?? e}\n`)
  process.exit(1)
})
