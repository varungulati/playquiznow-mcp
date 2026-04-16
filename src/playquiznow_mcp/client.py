"""HTTP client for the PlayQuizNow API."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class PlayQuizNowClient:
    """Async client that wraps the PlayQuizNow REST API."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        async with self._lock:
            if self._client is None or self._client.is_closed:
                self._client = httpx.AsyncClient(
                    base_url=self.base_url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=30.0,
                )
            return self._client

    async def close(self) -> None:
        async with self._lock:
            if self._client and not self._client.is_closed:
                await self._client.aclose()
                self._client = None

    # ── Response handling ────────────────────────────────────────

    async def _parse_response(self, resp: httpx.Response) -> dict[str, Any]:
        """Parse JSON response, handling non-JSON error pages gracefully."""
        if not resp.is_success:
            logger.warning("API error: %s %s → %d", resp.request.method, resp.request.url, resp.status_code)
            try:
                body = resp.json()
                # Normalize error field names (backend uses "errors", "error", or DRF "detail")
                error_msg = body.get("errors") or body.get("error") or body.get("detail") or body
                return {"status": False, "errors": error_msg}
            except (json.JSONDecodeError, ValueError):
                return {"status": False, "errors": f"HTTP {resp.status_code}: {resp.reason_phrase}"}

        try:
            return resp.json()
        except (json.JSONDecodeError, ValueError):
            return {"status": False, "errors": f"Unexpected non-JSON response (HTTP {resp.status_code})"}

    # ── Quiz endpoints ───────────────────────────────────────────

    async def create_quiz(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a quiz via POST /api/quiz/create/.

        The backend expects multipart/form-data with `questionset` as a
        JSON-stringified form field.
        """
        client = await self._get_client()

        # Build form data — questionset must be a JSON string
        form_data: dict[str, Any] = {
            "title": data["title"],
            "description": data.get("description", ""),
            "quiz_mode": data.get("quiz_mode", "single_player"),
            "access_type": data.get("access_type", "public"),
            "questionset": json.dumps(data["questionset"]),
            "negative_marking": "true" if data.get("negative_marking") else "false",
            "auto_start_quiz": "true" if data.get("auto_start_quiz") else "false",
            "ads_enabled": "false",
        }

        # Optional fields — only include if explicitly set
        for field in ("marketing_text", "marketing_link", "start_datetime", "end_datetime"):
            if data.get(field):
                form_data[field] = data[field]

        if data.get("max_plays_per_participant") is not None:
            form_data["max_plays_per_participant"] = str(data["max_plays_per_participant"])

        resp = await client.post("/api/quiz/create/", data=form_data)
        return await self._parse_response(resp)

    async def list_my_quizzes(self) -> dict[str, Any]:
        """GET /api/quiz/my-quizzes/"""
        client = await self._get_client()
        resp = await client.get("/api/quiz/my-quizzes/")
        return await self._parse_response(resp)

    async def get_quiz(self, join_code: str) -> dict[str, Any]:
        """GET /api/quiz/<join_code>/"""
        client = await self._get_client()
        resp = await client.get(f"/api/quiz/{join_code}/")
        return await self._parse_response(resp)

    async def delete_quiz(self, quiz_id: int) -> dict[str, Any]:
        """POST /api/quiz/delete/<id>/"""
        client = await self._get_client()
        resp = await client.post(f"/api/quiz/delete/{quiz_id}/")
        return await self._parse_response(resp)
