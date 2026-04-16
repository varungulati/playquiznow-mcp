# PlayQuizNow MCP Server

[![PyPI](https://img.shields.io/pypi/v/playquiznow-mcp)](https://pypi.org/project/playquiznow-mcp/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [PlayQuizNow](https://playquiznow.com) — the online quiz platform for education, training, and live events.

This server lets AI assistants like **Claude Desktop**, **Claude Code**, and other MCP-compatible tools create and manage quizzes directly on PlayQuizNow.

## What can it do?

| Tool | Description |
|------|-------------|
| `create_quiz` | Create a quiz with questions, answers, timing, scoring, and access controls |
| `list_my_quizzes` | List all quizzes you've created |
| `get_quiz` | Get full quiz details by join code |
| `delete_quiz` | Delete a quiz by ID |

### Example prompts

Once connected, just ask your AI assistant:

- *"Create a 10-question quiz about the French Revolution with multiple choice answers"*
- *"Make a private timed quiz on Python basics — 20 seconds per question, with explanations"*
- *"Create a quiz about climate change with negative marking for wrong answers"*
- *"List my quizzes"*
- *"Show me the details of quiz ABC123"*

## Quick Start

### 1. Get an API Key

Log into [PlayQuizNow](https://playquiznow.com), go to **API Keys** (in your profile menu), and create a new key. You'll get a key like `pqn_a1b2c3d4...` — save it, it's shown only once.

### 2. Configure Claude Desktop

Add to your [`claude_desktop_config.json`](https://claude.ai/docs/claude-desktop/mcp):

```json
{
  "mcpServers": {
    "playquiznow": {
      "command": "uvx",
      "args": ["playquiznow-mcp"],
      "env": {
        "PLAYQUIZNOW_API_KEY": "pqn_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You're ready to create quizzes.

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
pip install -e .

# Run locally against a dev server
PLAYQUIZNOW_API_KEY=pqn_... PLAYQUIZNOW_BASE_URL=http://localhost:8000 playquiznow-mcp
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
