# Changelog

All notable changes to `playquiznow-mcp` are documented here.

This project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-05-03

### Added
- **`update_quiz` tool** — partial update of a quiz's metadata fields (title, description, access_type, quiz_mode, auto_start_quiz, negative_marking, start_datetime, end_datetime, max_plays_per_participant, marketing_text, marketing_link). The `join_code` is preserved across updates, so the leaderboard and play history survive edits.
  - Owner-only: only the user who created the quiz can update it.
  - Partial semantics: omitted fields are unchanged; `null` clears nullable fields (start/end datetime, max plays, marketing text/link).
  - Question sets, questions, and answers are intentionally NOT editable — those still require deleting and recreating the quiz.
  - Requires backend with `PATCH /api/quiz/update-metadata/<id>/` endpoint.

## [0.1.1]

- Initial public release with `create_quiz`, `list_my_quizzes`, `get_quiz`, `delete_quiz`.
