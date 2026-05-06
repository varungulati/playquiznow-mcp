# Changelog

All notable changes to `playquiznow-mcp` are documented here.

This project follows [Semantic Versioning](https://semver.org/).

## [0.3.1] — 2026-05-06

### Changed
- **`set_question_images`** — `image_url` now accepts `null` to clear existing question attachments in bulk (mirrors `set_quiz_image`'s clear pattern). When clearing, `only_if_empty` is ignored and the operation restricts to questions that currently have an attachment, so the `questions_updated` count reflects real changes. Backwards-compatible: existing string-URL callers are unaffected. Requires backend with the matching clear-mode handler.

## [0.3.0] — 2026-05-05

### Added
- **`shuffle_quiz_answers` tool** — randomize the display position of answers across every multiple-choice question in a quiz, in-place. Answer IDs are preserved, so existing play history (UserQuizResult rows) stays intact. Use this to fix legacy quizzes where the correct answer always rendered at position A. Requires backend with `POST /api/quiz/<id>/shuffle-answers/` endpoint.
- **`set_quiz_image` tool** — set (or clear) the quiz banner image by URL. The server downloads the image, validates content-type and size (png/jpeg/gif/webp, ≤10MB), uploads to S3, and saves the path on the quiz. Requires backend with `POST /api/quiz/<id>/set-image/` endpoint.
- **`set_question_images` tool** — apply one image to many questions at once (e.g. add a banner to every question that doesn't have one). Server downloads the image once, then assigns the same S3 path to every matching question. Supports `only_if_empty` and `question_ids` filters. Requires backend with `POST /api/quiz/<id>/set-question-images/` endpoint.

### Changed
- **`create_quiz`** — the correct answer's display position is now randomized automatically before being sent to the backend. Previously, listing the correct answer first in the `answers` array (a natural authoring bias) caused all correct answers to land at position A on the rendered quiz.

## [0.2.0] — 2026-05-03

### Added
- **`update_quiz` tool** — partial update of a quiz's metadata fields (title, description, access_type, quiz_mode, auto_start_quiz, negative_marking, start_datetime, end_datetime, max_plays_per_participant, marketing_text, marketing_link). The `join_code` is preserved across updates, so the leaderboard and play history survive edits.
  - Owner-only: only the user who created the quiz can update it.
  - Partial semantics: omitted fields are unchanged; `null` clears nullable fields (start/end datetime, max plays, marketing text/link).
  - Question sets, questions, and answers are intentionally NOT editable — those still require deleting and recreating the quiz.
  - Requires backend with `PATCH /api/quiz/update-metadata/<id>/` endpoint.

## [0.1.1]

- Initial public release with `create_quiz`, `list_my_quizzes`, `get_quiz`, `delete_quiz`.
