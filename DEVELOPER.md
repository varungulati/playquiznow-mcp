# PlayQuizNow MCP Server — Developer Guide

Complete guide for developing, testing, and publishing the PlayQuizNow MCP server.

## Architecture

```
playquiznow-mcp/
├── pyproject.toml          # Package metadata, dependencies, entry point
├── server.json             # MCP Registry metadata (for publishing)
├── smithery.yaml           # Smithery.ai discovery config
├── LICENSE                 # MIT
├── README.md               # User-facing docs (also used for PyPI/AEO)
├── DEVELOPER.md            # This file
└── src/
    └── playquiznow_mcp/
        ├── __init__.py
        ├── __main__.py     # python -m playquiznow_mcp support
        ├── server.py       # MCP server entry point (stdio transport)
        ├── client.py       # Async HTTP client for PlayQuizNow API
        └── tools/
            ├── __init__.py
            └── quiz.py     # Tool definitions, schemas, handlers, validation
```

**Data flow:**
```
Claude Desktop → MCP stdio → server.py → tools/quiz.py → client.py → PlayQuizNow API
```

## Prerequisites

- Python 3.10+
- A PlayQuizNow account with an API key
- The PlayQuizNow backend running (locally or production)

## Local Development Setup

### 1. Clone and install

```bash
cd playquiznow-mcp
pip install -e .
```

### 2. Get an API key

**Option A — Django admin:** Create an APIKey record in the admin panel.

**Option B — API endpoint:** (requires Firebase auth)
```bash
curl -X POST https://api.playquiznow.com/api/auth/api-keys/ \
  -H "Authorization: Bearer <firebase_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "dev-testing"}'
```

**Option C — Frontend:** Log into PlayQuizNow → Profile menu → API Keys → Create.

### 3. Run the MCP server locally

```bash
PLAYQUIZNOW_API_KEY=pqn_your_key_here \
PLAYQUIZNOW_BASE_URL=http://localhost:8000 \
playquiznow-mcp
```

The server communicates over stdio (stdin/stdout). It will sit waiting for MCP JSON-RPC messages.

### 4. Configure Claude Desktop for local testing

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "playquiznow": {
      "command": "python",
      "args": ["-m", "playquiznow_mcp"],
      "env": {
        "PLAYQUIZNOW_API_KEY": "pqn_your_key_here",
        "PLAYQUIZNOW_BASE_URL": "http://localhost:8000"
      }
    }
  }
}
```

Restart Claude Desktop. You should see "playquiznow" in the MCP tools list.

### 5. Test with MCP Inspector

The official MCP Inspector tool is useful for testing without Claude Desktop:

```bash
npx @modelcontextprotocol/inspector playquiznow-mcp
```

Or manually via stdio:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  PLAYQUIZNOW_API_KEY=pqn_... playquiznow-mcp
```

## Testing Checklist

Before any release, verify:

- [ ] `create_quiz` — creates a quiz, returns join_code
- [ ] `create_quiz` with all optional params (negative_marking, timing, scheduling)
- [ ] `create_quiz` validation — empty answers, no correct answer, > 100 questions
- [ ] `list_my_quizzes` — returns the user's quizzes
- [ ] `get_quiz` — returns full quiz data by join code
- [ ] `delete_quiz` — deletes a quiz by ID
- [ ] Invalid API key → clear error message
- [ ] Backend down → graceful error (not crash)
- [ ] Quiz appears correctly in PlayQuizNow web UI after creation

## Adding New Tools

To add a new tool (e.g., LTI, WordPress, widget):

1. **Create a new file** in `src/playquiznow_mcp/tools/` (e.g., `lti.py`)
2. **Define the tool schema** (JSON Schema for input parameters)
3. **Add handler functions** (async, receive client + arguments)
4. **Add API methods** to `client.py` if needed
5. **Register tools** in a `register_xxx_tools(app, client)` function
6. **Call the registration** from `server.py`

Example pattern:
```python
# tools/lti.py
from mcp.server import Server
from mcp.types import TextContent, Tool
from ..client import PlayQuizNowClient

LTI_TOOLS = [
    Tool(name="generate_lti_key", description="...", inputSchema={...}),
]

async def handle_generate_lti_key(client, arguments):
    # implementation
    ...

def register_lti_tools(app: Server, client: PlayQuizNowClient):
    # same pattern as register_quiz_tools
    ...
```

Then in `server.py`:
```python
from .tools.lti import register_lti_tools
register_lti_tools(app, client)
```

## Adding New Quiz Parameters

When a new field is added to the Quiz model in the backend:

1. **Add to `CREATE_QUIZ_SCHEMA`** in `tools/quiz.py` — add the property with type, description, default
2. **Pass through in `handle_create_quiz()`** — add to the `data` dict or the optional fields loop
3. **Forward in `client.py` `create_quiz()`** — add to `form_data` if always sent, or the optional fields loop

The schema is designed so all new fields are optional with sensible defaults.

## Publishing to PyPI

### First time setup

```bash
pip install build twine
```

### Build and upload

```bash
# Bump version in pyproject.toml and server.json
cd playquiznow-mcp

# Build
python -m build

# Upload to PyPI (requires PyPI API token)
twine upload dist/*
```

After publishing, `uvx playquiznow-mcp` will work for anyone.

### Test the published package

```bash
uvx playquiznow-mcp --help  # Should show error about missing API key
```

## Publishing to the MCP Registry

The MCP Registry (registry.modelcontextprotocol.io) is the official directory
where AI tools discover MCP servers. Publishing here is what enables AI
discoverability (AEO).

### Prerequisites

- Package published to PyPI (see above)
- GitHub account that owns the `playquiznow` organization (for namespace verification)
- `mcp-publisher` CLI installed

### Step 1: Install mcp-publisher

```bash
# macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Or via Homebrew
brew install mcp-publisher
```

### Step 2: Authenticate

```bash
mcp-publisher login github
# Follow the prompts — visit https://github.com/login/device and enter the code
```

### Step 3: Verify server.json

The `server.json` file is already configured. Key fields:
- `name`: `io.github.playquiznow/quiz` — must match your GitHub namespace
- `packages[0].identifier`: `playquiznow-mcp` — must match PyPI package name
- `packages[0].version`: must match the version published to PyPI

### Step 4: Publish

```bash
mcp-publisher publish
```

The registry validates:
- The PyPI package exists with the correct version
- Your GitHub identity matches the `io.github.playquiznow/` namespace
- The package metadata is valid

**Publishing is automatic** — there is no manual review or approval queue.
The server appears in the registry immediately after successful validation.

### Step 5: Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=playquiznow"
```

## Publishing to Other Directories

### Smithery.ai

The `smithery.yaml` file is already included. Register at https://smithery.ai
and point it to the GitHub repo — it auto-detects the config.

### Glama.ai

Register at https://glama.ai/mcp/servers and submit the GitHub repo URL.

## Version Bumping

When releasing a new version, update these files:

1. `pyproject.toml` → `version`
2. `server.json` → `version` AND `packages[0].version`

Then: build → upload to PyPI → `mcp-publisher publish`.

## Backend Changes Required

The MCP server depends on these backend endpoints:

| Endpoint | Method | Auth | Used by |
|----------|--------|------|---------|
| `/api/quiz/create/` | POST | API Key | `create_quiz` |
| `/api/quiz/my-quizzes/` | GET | API Key | `list_my_quizzes` |
| `/api/quiz/<join_code>/` | GET | API Key | `get_quiz` |
| `/api/quiz/delete/<id>/` | POST | API Key | `delete_quiz` |
| `/api/quiz/update/<id>/` | PUT | API Key | (future) |
| `/api/auth/api-keys/` | GET/POST | Firebase | Key management |
| `/api/auth/api-keys/<id>/` | DELETE | Firebase | Key revocation |

These views must include `APIKeyAuthentication` in their `authentication_classes`.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Invalid or revoked API key" | Key was revoked or never existed | Generate a new key |
| "API key is empty" | `PLAYQUIZNOW_API_KEY` env var not set | Set the env var in config |
| Connection refused | Backend not running | Start the backend server |
| Quiz creation fails with 403 | User hit plan limit | Upgrade subscription or delete old quizzes |
| "Maximum 10 active API keys" | Too many keys | Revoke unused keys first |
