"""PlayQuizNow MCP Server.

Create and manage quizzes on PlayQuizNow from AI tools like Claude Desktop.

Configuration via environment variables:
    PLAYQUIZNOW_API_KEY  — Required. Your PlayQuizNow API key (starts with pqn_).
    PLAYQUIZNOW_BASE_URL — Optional. Defaults to https://api.playquiznow.com
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from mcp.server import Server
from mcp.server.stdio import stdio_server

from .client import PlayQuizNowClient
from .tools.quiz import register_quiz_tools

DEFAULT_BASE_URL = "https://api.playquiznow.com"

# Log to stderr so it doesn't interfere with MCP's stdio protocol
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("playquiznow_mcp")


def main() -> None:
    api_key = os.environ.get("PLAYQUIZNOW_API_KEY", "")
    base_url = os.environ.get("PLAYQUIZNOW_BASE_URL", DEFAULT_BASE_URL)

    if not api_key:
        print(
            "Error: PLAYQUIZNOW_API_KEY environment variable is required.\n"
            "Generate one at https://playquiznow.com/settings/api-keys",
            file=sys.stderr,
        )
        sys.exit(1)

    if not api_key.startswith("pqn_"):
        logger.warning("API key does not start with 'pqn_' — verify it's a valid PlayQuizNow key")

    logger.info("Starting PlayQuizNow MCP server (base_url=%s)", base_url)

    app = Server("playquiznow")
    client = PlayQuizNowClient(base_url=base_url, api_key=api_key)

    register_quiz_tools(app, client)

    async def run():
        try:
            async with stdio_server() as (read_stream, write_stream):
                await app.run(read_stream, write_stream, app.create_initialization_options())
        finally:
            await client.close()
            logger.info("PlayQuizNow MCP server shut down")

    asyncio.run(run())


if __name__ == "__main__":
    main()
