# PlayQuizNow MCP Server

[![npm](https://img.shields.io/npm/v/playquiznow-mcp)](https://www.npmjs.com/package/playquiznow-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [PlayQuizNow](https://playquiznow.com) — the online quiz platform for education, training, and live events.

This server lets AI assistants like **claude.ai**, **ChatGPT**, **Claude Desktop**, **Claude Code**, and other MCP-compatible tools create and manage quizzes directly on PlayQuizNow.

## Quick start — hosted server (recommended, no install)

Add the remote server and sign in when prompted (OAuth — no API key needed):

```
https://mcp.playquiznow.com/mcp
```

- **claude.ai / Claude mobile:** Settings → Connectors → Add custom connector → paste the URL
- **ChatGPT:** Settings → Apps & Connectors → enable Developer mode → Create → paste the URL
- **Claude Code:**

```bash
claude mcp add --transport http playquiznow https://mcp.playquiznow.com/mcp
```

Prefer a key? Use `https://mcp.playquiznow.com/k/<your-api-key>/mcp` (create keys at [playquiznow.com/api-keys](https://playquiznow.com/api-keys)), or run locally via npx — see [Local install](#local-install-npx) below.

## What can it do?

| Tool | Description |
|------|-------------|
| `create_quiz` | Create a quiz with questions, answers, timing, scoring, and access controls |
| `list_my_quizzes` | List your quizzes; filter with `q`, `category`, paginate with `page`/`limit` |
| `get_quiz` | Get full quiz details by join code |
| `update_quiz` | Edit an existing quiz's metadata (title, description, access, schedule, etc.) — keeps the join code |
| `delete_quiz` | Delete a quiz by ID |
| `search_question_library` | Find ready-made questions from official free quizzes by words and category |
| `get_library_questions` | Get complete library questions, ready to pass to `create_quiz` |

#### `update_quiz` — what's editable

Pass `quiz_id` plus any subset of: `title`, `description`, `access_type`, `quiz_mode`, `auto_start_quiz`, `negative_marking`, `start_datetime`, `end_datetime`, `max_plays_per_participant`, `marketing_text`, `marketing_link`, `category`, `age_group`, `kid_safe`, `theme`, `leaderboard_mode`, `video_url`, `embed_domains`, `tags`, `price` (staff only), `is_listed` (staff only). Omitted fields stay unchanged. The `join_code` is permanent and never changes.

**Question sets, questions, and answers are NOT editable** through `update_quiz` — to change those, delete the quiz and create a new one. (This loses the join code, leaderboard, and play history.)

### Example prompts

Once connected, just ask your AI assistant:

- *"Create a 10-question quiz about the French Revolution with multiple choice answers"*
- *"Make a private timed quiz on Python basics — 20 seconds per question, with explanations"*
- *"Create a quiz about climate change with negative marking for wrong answers"*
- *"List my quizzes"*
- *"Show me the details of quiz ABC123"*
- *"Change the description of quiz 574 to 'Updated Q3 onboarding quiz'"*
- *"Make quiz 612 private and set it to close on 2026-12-31"*

## Local install (npx)

### 1. Get an API Key

Log into [PlayQuizNow](https://playquiznow.com), go to **API Keys** (in your profile menu), and create a new key. You'll get a key like `pqn_a1b2c3d4...` — save it, it's shown only once.

### 2. Configure Claude Desktop

Add to your [`claude_desktop_config.json`](https://claude.ai/docs/claude-desktop/mcp):

```json
{
  "mcpServers": {
    "playquiznow": {
      "command": "npx",
      "args": ["-y", "playquiznow-mcp"],
      "env": {
        "PLAYQUIZNOW_API_KEY": "pqn_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You're ready to create quizzes — no additional installs needed (Node/npx ships with Claude Desktop's launcher).

### 3. Try it

Ask Claude: *"Create a quiz about space exploration with 5 questions"*

Claude will generate the questions and create the quiz on PlayQuizNow. You'll get a join code and link that players can use immediately.

## Quiz Creation Options

The `create_quiz` tool supports all quiz configuration options:

### Quiz Settings

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | string | *required* | Quiz title |
| `description` | string | `""` | Description shown to players |
| `quiz_mode` | enum | `"single_player"` | `single_player` or `multi_player` |
| `access_type` | enum | `"public"` | `public`, `private`, or `unlisted` |
| `negative_marking` | boolean | `false` | Deduct points for wrong answers |
| `auto_start_quiz` | boolean | `false` | Skip waiting room |
| `start_datetime` | ISO 8601 | now | When quiz becomes available |
| `end_datetime` | ISO 8601 | — | When quiz closes |
| `max_plays_per_participant` | integer | — | Limit plays per player |
| `marketing_text` | string | — | Text shown on results page |
| `marketing_link` | string | — | URL linked from results page |
| `category` | string | — | Category slug (kids-family, geography, holidays-occasions, …) |
| `age_group` | string | — | all_ages / preschool / kids_6_8 / kids_9_12 / teens / adults |
| `kid_safe` | boolean | `false` | Explicitly mark content as suitable for kids |
| `theme` | string | `default` | Visual theme players see: `default`, `arcade`, `ocean`, `jungle`, `space`, `candy`, `chalkboard`, `festive`, `boardroom` |
| `leaderboard_mode` | string | `live` | What players see during a game: `live`, `top5`, or `hidden` until the final results. |
| `video_url` | string | none | Public YouTube link the quiz is about. Players watch it before starting, or in the lobby in a live game. |
| `embed_domains` | string[] | `[]` | Sites allowed to embed the quiz, such as `example.com` or `*.example.com`. A private quiz only plays on listed sites |
| `tags` | string[] | — | Up to 10 free tags (normalized), e.g. christmas, spanish-a1 |
| `price` | number | `0` | Price tier 0/5/10/20/50/100 (staff accounts only) |
| `is_listed` | boolean | `false` | Show on the public marketplace (staff accounts only) |

### Question Settings

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | *required* | Question text (plain text) |
| `question_type` | enum | `"mcq_text"` | `mcq_text`, `poll`, or `text_answer` |
| `answers` | array | *required* | Answer options (1-8 per question) |
| `positive_points` | number | `1` | Points for correct answer |
| `negative_points` | number | `0` | Points deducted for wrong answer |
| `time_for_question` | integer | `30` | Seconds to answer (5-300) |
| `time_for_answer` | integer | `10` | Seconds to show explanation (3-60) |
| `correct_answer_explanation` | string | `""` | Explanation shown after answering |

### Limits

- Max 100 questions per quiz
- Max 10 question sets per quiz
- Max 8 answer options per question
- MCQ questions must have at least 1 correct answer

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLAYQUIZNOW_API_KEY` | Yes | — | Your PlayQuizNow API key (`pqn_...`) |
| `PLAYQUIZNOW_BASE_URL` | No | `https://api.playquiznow.com` | API base URL |

## Development

```bash
git clone https://github.com/playquiznow/playquiznow-mcp.git
cd playquiznow-mcp
npm install
npm run build

# Run locally against a dev server
PLAYQUIZNOW_API_KEY=pqn_... PLAYQUIZNOW_BASE_URL=http://localhost:8000 node dist/index.js
```

### Publishing

```bash
npm login
npm publish   # runs prepublishOnly → tsc → publishes
```

## About PlayQuizNow

[PlayQuizNow](https://playquiznow.com) is an online quiz platform for educators, trainers, and event organizers. Features include:

- Single-player and live multiplayer quizzes
- LTI integration (Canvas, Moodle, Blackboard, D2L)
- WordPress plugin and embeddable widget
- Google Classroom integration
- Enterprise SSO
- Real-time leaderboards and analytics

## License

MIT
