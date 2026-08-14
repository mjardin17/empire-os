"""
Google Gemini adapter for the AIProvider interface.

Ported from video-bot-pipeline/storyforge/generator.py's call_gemini()
direct-REST path (this repo has no equivalent of that script's
ai_router fallback layer, so this is the plain REST call only).

Auth is a `?key=` query parameter, not a header — that's a genuine
Gemini API quirk, not an oversight.
"""

from __future__ import annotations

import os
from typing import Optional

from core.ai.provider import AIProvider, CompletionResult, ProviderError


class GeminiProvider(AIProvider):
    """Google Gemini — the default model for StoryForge's book generation
    (core/book/generator.py), also usable by the Creative Council like any
    other registered provider."""
    name = "gemini"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")

    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        if not self.api_key:
            raise ProviderError("GEMINI_API_KEY is not set")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.8, "maxOutputTokens": 8192},
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        headers = {"Content-Type": "application/json"}
        result = self._post_json(url, headers, payload, timeout)

        candidates = result.get("candidates") or []
        if not candidates:
            block_reason = (result.get("promptFeedback") or {}).get("blockReason")
            raise ProviderError(f"Gemini returned no candidates (blockReason={block_reason})")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        return CompletionResult(text=text, provider=self.name, model=model, raw=result)
