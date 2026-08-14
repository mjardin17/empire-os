"""
StoryForge AI Provider Layer
-----------------------------
A single, swappable interface for calling any LLM provider. Every
adapter implements the same `complete(system, prompt)` contract so the
Creative Council (and any future module) never needs to know which
provider is behind it.

Uses `urllib.request` (stdlib) so no extra dependency is required to run
the engine out of the box. Swap in `httpx`/`requests` later if you want
async or connection pooling — the AIProvider interface doesn't change.

All API keys are read from environment variables. Never hardcode keys.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class CompletionResult:
    text: str
    provider: str
    model: str
    raw: Optional[dict] = None


class ProviderError(RuntimeError):
    pass


class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        ...

    def _post_json(self, url: str, headers: dict, payload: dict, timeout: int) -> dict:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            raise ProviderError(f"{self.name} HTTP {e.code}: {body}") from e
        except urllib.error.URLError as e:
            raise ProviderError(f"{self.name} connection failed: {e.reason}") from e


class OpenRouterProvider(AIProvider):
    """Routes to any model available on OpenRouter (Claude, GPT, Gemini,
    DeepSeek, Llama, etc. all through one API key)."""
    name = "openrouter"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")

    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        if not self.api_key:
            raise ProviderError("OPENROUTER_API_KEY is not set")
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        result = self._post_json("https://openrouter.ai/api/v1/chat/completions", headers, payload, timeout)
        text = result["choices"][0]["message"]["content"]
        return CompletionResult(text=text, provider=self.name, model=model, raw=result)


class AnthropicProvider(AIProvider):
    """Direct Anthropic API access (bypassing OpenRouter) for lower latency."""
    name = "anthropic"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")

    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        if not self.api_key:
            raise ProviderError("ANTHROPIC_API_KEY is not set")
        payload = {
            "model": model,
            "max_tokens": 2000,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        result = self._post_json("https://api.anthropic.com/v1/messages", headers, payload, timeout)
        text = "".join(block.get("text", "") for block in result.get("content", []))
        return CompletionResult(text=text, provider=self.name, model=model, raw=result)


class OllamaProvider(AIProvider):
    """Local, self-hosted models — no API key, no per-token cost."""
    name = "ollama"

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

    def complete(self, model: str, system: str, prompt: str, timeout: int = 120) -> CompletionResult:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
        }
        headers = {"Content-Type": "application/json"}
        result = self._post_json(f"{self.base_url}/api/chat", headers, payload, timeout)
        text = result.get("message", {}).get("content", "")
        return CompletionResult(text=text, provider=self.name, model=model, raw=result)


_PROVIDERS = {
    "openrouter": OpenRouterProvider,
    "anthropic": AnthropicProvider,
    "ollama": OllamaProvider,
}


def get_provider(name: str) -> AIProvider:
    if name not in _PROVIDERS:
        raise ProviderError(
            f"Unknown provider '{name}'. Available: {', '.join(_PROVIDERS.keys())}. "
            f"Add new adapters by subclassing AIProvider and registering in _PROVIDERS."
        )
    return _PROVIDERS[name]()


def _register_gemini() -> None:
    # Deferred import avoids a circular import (gemini_provider imports
    # AIProvider/CompletionResult/ProviderError from this module).
    from core.ai.gemini_provider import GeminiProvider
    _PROVIDERS["gemini"] = GeminiProvider


_register_gemini()
