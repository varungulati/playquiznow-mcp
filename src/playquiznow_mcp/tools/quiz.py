"""Quiz management tools for the PlayQuizNow MCP server."""

from __future__ import annotations

import json
import logging
from typing import Any

from mcp.server import Server
from mcp.types import TextContent, Tool

from ..client import PlayQuizNowClient

logger = logging.getLogger(__name__)

# ── Limits ───────────────────────────────────────────────────────

MAX_QUESTION_SETS = 10
MAX_QUESTIONS_PER_SET = 50
MAX_TOTAL_QUESTIONS = 100
MAX_ANSWERS_PER_QUESTION = 8

# ── Tool schemas ─────────────────────────────────────────────────

CREATE_QUIZ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        # ── Required ──
        "title": {
            "type": "string",
            "description": "Quiz title (max 200 chars)",
            "maxLength": 200,
        },
        "question_sets": {
            "type": "array",
            "description": f"Array of question sets (max {MAX_QUESTION_SETS}). Each set groups related questions.",
            "maxItems": MAX_QUESTION_SETS,
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Question set title (e.g. 'General Knowledge')",
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional description for the question set",
                        "default": "",
                    },
                    "passage": {
                        "type": "string",
                        "description": "Optional reading passage for comprehension questions. Plain text or HTML.",
                        "default": "",
                    },
                    "questions": {
                        "type": "array",
                        "description": f"Questions in this set (max {MAX_QUESTIONS_PER_SET}). Total across all sets must not exceed {MAX_TOTAL_QUESTIONS}.",
                        "maxItems": MAX_QUESTIONS_PER_SET,
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {
                                    "type": "string",
                                    "description": "Question text. Use plain text (not HTML). Example: 'What is the capital of France?'",
                                },
                                "question_type": {
                                    "type": "string",
                                    "enum": ["mcq_text", "poll", "text_answer"],
                                    "description": "mcq_text = multiple choice (must have at least 1 correct answer), poll = poll (no correct answer needed), text_answer = free text response",
                                    "default": "mcq_text",
                                },
                                "answers": {
                                    "type": "array",
                                    "description": "Answer options (2-8 per question). For mcq_text, at least one must have is_correct=true. For poll, none need is_correct. For text_answer, provide one answer with the expected text.",
                                    "minItems": 1,
                                    "maxItems": MAX_ANSWERS_PER_QUESTION,
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "text": {
                                                "type": "string",
                                                "description": "Answer text",
                                            },
                                            "is_correct": {
                                                "type": "boolean",
                                                "description": "Whether this is a correct answer. Required for mcq_text questions.",
                                                "default": False,
                                            },
                                        },
                                        "required": ["text"],
                                    },
                                },
                                "positive_points": {
                                    "type": "number",
                                    "description": "Points awarded for correct answer",
                                    "default": 1,
                                },
                                "negative_points": {
                                    "type": "number",
                                    "description": "Points deducted for wrong answer (only if quiz has negative_marking=true)",
                                    "default": 0,
                                },
                                "time_for_question": {
                                    "type": "integer",
                                    "description": "Seconds to answer the question",
                                    "default": 30,
                                    "minimum": 5,
                                    "maximum": 300,
                                },
                                "time_for_answer": {
                                    "type": "integer",
                                    "description": "Seconds to display the answer/explanation after answering",
                                    "default": 10,
                                    "minimum": 3,
                                    "maximum": 60,
                                },
                                "correct_answer_explanation": {
                                    "type": "string",
                                    "description": "Explanation shown after answering. Plain text.",
                                    "default": "",
                                },
                            },
                            "required": ["text", "answers"],
                        },
                    },
                },
                "required": ["title", "questions"],
            },
        },
        # ── Optional quiz settings ──
        "description": {
            "type": "string",
            "description": "Quiz description shown to players before starting. Plain text.",
            "default": "",
        },
        "quiz_mode": {
            "type": "string",
            "enum": ["single_player", "multi_player"],
            "description": "single_player = players take quiz individually, multi_player = live multiplayer session",
            "default": "single_player",
        },
        "access_type": {
            "type": "string",
            "enum": ["public", "private", "unlisted"],
            "description": "public = anyone can find and play, private = only via direct link, unlisted = not listed but accessible via link",
            "default": "public",
        },
        "negative_marking": {
            "type": "boolean",
            "description": "Deduct points for wrong answers (uses each question's negative_points value)",
            "default": False,
        },
        "auto_start_quiz": {
            "type": "boolean",
            "description": "Automatically start the quiz for participants (no waiting room)",
            "default": False,
        },
        "start_datetime": {
            "type": "string",
            "description": "ISO 8601 datetime when quiz becomes available (e.g. '2026-04-20T10:00:00Z'). Defaults to now.",
        },
        "end_datetime": {
            "type": "string",
            "description": "ISO 8601 datetime when quiz closes. No default (quiz stays open indefinitely).",
        },
        "max_plays_per_participant": {
            "type": "integer",
            "description": "Maximum number of times each player can take this quiz. Subject to the user's subscription plan limit.",
            "minimum": 1,
        },
        "marketing_text": {
            "type": "string",
            "description": "Custom text shown on the quiz results page (e.g. a call-to-action).",
        },
        "marketing_link": {
            "type": "string",
            "description": "URL linked from the marketing text on the results page.",
        },
    },
    "required": ["title", "question_sets"],
}

LIST_QUIZZES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {},
}

GET_QUIZ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "join_code": {
            "type": "string",
            "description": "The 6-character quiz join code",
        },
    },
    "required": ["join_code"],
}

DELETE_QUIZ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "quiz_id": {
            "type": "integer",
            "description": "The quiz ID to delete",
        },
    },
    "required": ["quiz_id"],
}


# ── Tool definitions ─────────────────────────────────────────────

TOOLS = [
    Tool(
        name="create_quiz",
        description=(
            "Create a new quiz on PlayQuizNow. Provide a title and one or more "
            "question sets, each containing questions with answer options. "
            "For multiple-choice questions (mcq_text), mark at least one answer "
            "as correct. Use plain text for question/answer text (not HTML). "
            "Returns the quiz join code and URL. "
            f"Limits: max {MAX_TOTAL_QUESTIONS} questions total, max {MAX_QUESTION_SETS} question sets."
        ),
        inputSchema=CREATE_QUIZ_SCHEMA,
    ),
    Tool(
        name="list_my_quizzes",
        description="List all quizzes created by the authenticated user on PlayQuizNow.",
        inputSchema=LIST_QUIZZES_SCHEMA,
    ),
    Tool(
        name="get_quiz",
        description="Get full details of a quiz by its join code, including all questions and answers.",
        inputSchema=GET_QUIZ_SCHEMA,
    ),
    Tool(
        name="delete_quiz",
        description="Delete a quiz by its ID. Only the quiz owner can delete it.",
        inputSchema=DELETE_QUIZ_SCHEMA,
    ),
]


# ── Validation ───────────────────────────────────────────────────

def _validate_quiz_data(arguments: dict) -> str | None:
    """Validate quiz data before sending to the backend.
    Returns an error message string, or None if valid."""

    question_sets = arguments.get("question_sets", [])
    if not question_sets:
        return "At least one question set is required."

    if len(question_sets) > MAX_QUESTION_SETS:
        return f"Maximum {MAX_QUESTION_SETS} question sets allowed."

    total_questions = 0
    for qs_idx, qs in enumerate(question_sets, 1):
        questions = qs.get("questions", [])
        if not questions:
            return f"Question set {qs_idx} ('{qs.get('title', '')}') has no questions."

        if len(questions) > MAX_QUESTIONS_PER_SET:
            return f"Question set {qs_idx} has {len(questions)} questions (max {MAX_QUESTIONS_PER_SET})."

        total_questions += len(questions)

        for q_idx, q in enumerate(questions, 1):
            q_type = q.get("question_type", "mcq_text")
            answers = q.get("answers", [])

            if not answers:
                return f"Question {q_idx} in set {qs_idx} has no answers."

            if len(answers) > MAX_ANSWERS_PER_QUESTION:
                return f"Question {q_idx} in set {qs_idx} has {len(answers)} answers (max {MAX_ANSWERS_PER_QUESTION})."

            # MCQ must have at least one correct answer
            if q_type == "mcq_text":
                has_correct = any(a.get("is_correct", False) for a in answers)
                if not has_correct:
                    return f"Question {q_idx} in set {qs_idx} is multiple-choice but has no correct answer. Mark at least one answer as is_correct=true."

    if total_questions > MAX_TOTAL_QUESTIONS:
        return f"Total questions ({total_questions}) exceeds maximum of {MAX_TOTAL_QUESTIONS}."

    return None


# ── Tool handlers ────────────────────────────────────────────────

def _transform_question_sets(question_sets: list[dict]) -> list[dict]:
    """Transform MCP tool input into the backend's expected questionset format."""
    result = []
    for qs in question_sets:
        transformed_qs = {
            "title": qs["title"],
            "description": qs.get("description", ""),
            "passage": qs.get("passage", ""),
            "questions": [],
        }
        for q in qs["questions"]:
            transformed_q = {
                "text": q["text"],
                "question_type": q.get("question_type", "mcq_text"),
                "positive_points": q.get("positive_points", 1),
                "negative_points": q.get("negative_points", 0),
                "time_for_question": q.get("time_for_question", 30),
                "time_for_answer": q.get("time_for_answer", 10),
                "correct_answer_explanation": q.get("correct_answer_explanation", ""),
                "attachment": None,
                "answer": [
                    {
                        "text": a["text"],
                        "is_correct": a.get("is_correct", False),
                        "attachment": None,
                    }
                    for a in q.get("answers", [])
                ],
            }
            transformed_qs["questions"].append(transformed_q)
        result.append(transformed_qs)
    return result


async def handle_create_quiz(client: PlayQuizNowClient, arguments: dict) -> list[TextContent]:
    """Handle the create_quiz tool call."""

    # Validate before sending to backend
    error = _validate_quiz_data(arguments)
    if error:
        return [TextContent(type="text", text=f"Validation error: {error}")]

    question_sets = _transform_question_sets(arguments["question_sets"])

    data: dict[str, Any] = {
        "title": arguments["title"],
        "description": arguments.get("description", ""),
        "quiz_mode": arguments.get("quiz_mode", "single_player"),
        "access_type": arguments.get("access_type", "public"),
        "negative_marking": arguments.get("negative_marking", False),
        "auto_start_quiz": arguments.get("auto_start_quiz", False),
        "questionset": question_sets,
    }

    # Pass through optional fields
    for field in ("start_datetime", "end_datetime", "marketing_text", "marketing_link", "max_plays_per_participant"):
        if arguments.get(field) is not None:
            data[field] = arguments[field]

    result = await client.create_quiz(data)

    if result.get("status"):
        quiz_data = result.get("data", {})
        join_code = quiz_data.get("join_code", "unknown")
        title = quiz_data.get("title", arguments["title"])
        total_questions = sum(len(qs.get("questions", [])) for qs in arguments["question_sets"])

        lines = [
            "Quiz created successfully!\n",
            f"- **Title:** {title}",
            f"- **Join Code:** {join_code}",
            f"- **Questions:** {total_questions}",
            f"- **Mode:** {arguments.get('quiz_mode', 'single_player')}",
            f"- **Access:** {arguments.get('access_type', 'public')}",
        ]
        if arguments.get("negative_marking"):
            lines.append("- **Negative Marking:** enabled")
        lines.append(f"\nPlayers can join at: https://playquiznow.com/play/{join_code}")

        return [TextContent(type="text", text="\n".join(lines))]
    else:
        errors = result.get("errors", "Unknown error")
        if isinstance(errors, dict):
            errors = json.dumps(errors, indent=2)
        return [TextContent(type="text", text=f"Failed to create quiz: {errors}")]


async def handle_list_my_quizzes(client: PlayQuizNowClient, arguments: dict) -> list[TextContent]:
    """Handle the list_my_quizzes tool call."""
    result = await client.list_my_quizzes()

    if isinstance(result, list):
        quizzes = result
    elif isinstance(result, dict):
        quizzes = result.get("results", result.get("data", []))
    else:
        quizzes = []

    if not quizzes:
        return [TextContent(type="text", text="No quizzes found.")]

    lines = [f"Found {len(quizzes)} quiz(es):\n"]
    for q in quizzes:
        title = q.get("title", "Untitled")
        join_code = q.get("join_code", "—")
        mode = q.get("quiz_mode", "—")
        quiz_id = q.get("id", "—")
        lines.append(
            f"- **{title}** (ID: {quiz_id}, Code: {join_code}, Mode: {mode})"
        )

    return [TextContent(type="text", text="\n".join(lines))]


async def handle_get_quiz(client: PlayQuizNowClient, arguments: dict) -> list[TextContent]:
    """Handle the get_quiz tool call."""
    join_code = arguments["join_code"]
    result = await client.get_quiz(join_code)

    if isinstance(result, list) and result:
        quiz = result[0]
    elif isinstance(result, dict):
        quiz = result
    else:
        return [TextContent(type="text", text=f"No quiz found with code '{join_code}'.")]

    text = json.dumps(quiz, indent=2, default=str)
    return [TextContent(type="text", text=f"Quiz details for {join_code}:\n\n```json\n{text}\n```")]


async def handle_delete_quiz(client: PlayQuizNowClient, arguments: dict) -> list[TextContent]:
    """Handle the delete_quiz tool call."""
    quiz_id = arguments["quiz_id"]
    result = await client.delete_quiz(quiz_id)

    if result.get("status"):
        return [TextContent(type="text", text=f"Quiz {quiz_id} deleted successfully.")]
    else:
        errors = result.get("errors", "Unknown error")
        return [TextContent(type="text", text=f"Failed to delete quiz: {errors}")]


def register_quiz_tools(app: Server, client: PlayQuizNowClient) -> None:
    """Register quiz tools with the MCP server."""

    @app.list_tools()
    async def list_tools() -> list[Tool]:
        return TOOLS

    @app.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        handlers = {
            "create_quiz": handle_create_quiz,
            "list_my_quizzes": handle_list_my_quizzes,
            "get_quiz": handle_get_quiz,
            "delete_quiz": handle_delete_quiz,
        }

        handler = handlers.get(name)
        if not handler:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

        try:
            return await handler(client, arguments)
        except Exception as e:
            logger.exception("Tool '%s' failed", name)
            error_type = type(e).__name__
            return [TextContent(type="text", text=f"Error ({error_type}): {e}")]
