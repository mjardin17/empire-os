"""
StoryForge Image Provider Layer
---------------------------------
A single, swappable interface for calling any image-generation backend.
Every adapter implements the same `generate(...)` contract so Image
Studio (and any future module) never needs to know which provider is
behind it. This mirrors `core/ai/provider.py` exactly, so anyone already
familiar with that file already understands this one.

Uses `urllib.request` (stdlib) so no extra dependency is required for
the network-calling adapters. The local `PlaceholderProvider` uses
Pillow if it's installed (nicer test images) and falls back to a tiny
hand-built PNG if it isn't, so smoke tests never require a real image
library or network access.

All API keys / endpoints are read from environment variables. Never
hardcode keys.

Add a new provider by:
  1. Subclassing `ImageProvider`.
  2. Implementing `generate(...)`.
  3. Registering it in `_IMAGE_PROVIDERS`.
Nothing else in Image Studio changes.
"""

from __future__ import annotations

import base64
import json
import os
import struct
import time
import urllib.error
import urllib.request
import uuid
import zlib
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional

from core.ai.provider import ProviderError  # shared error type, same semantics
from core.image.models import GenerationResult


class ImageProvider(ABC):
    name: str = "base"

    @abstractmethod
    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        ...

    def is_configured(self) -> bool:
        """Cheap, network-free check of whether this provider has what
        it needs (API key, etc.) to actually run. Used by the
        `/image-providers` listing endpoint so a UI can grey out
        providers that aren't ready yet, without making a live call."""
        return True

    # -- shared helpers -------------------------------------------------

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

    def _get_json(self, url: str, headers: Optional[dict], timeout: int) -> dict:
        req = urllib.request.Request(url, headers=headers or {}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            raise ProviderError(f"{self.name} HTTP {e.code}: {body}") from e
        except urllib.error.URLError as e:
            raise ProviderError(f"{self.name} connection failed: {e.reason}") from e

    def _get_bytes(self, url: str, headers: Optional[dict], timeout: int) -> bytes:
        req = urllib.request.Request(url, headers=headers or {}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            raise ProviderError(f"{self.name} HTTP {e.code} fetching {url}") from e
        except urllib.error.URLError as e:
            raise ProviderError(f"{self.name} connection failed: {e.reason}") from e

    @staticmethod
    def _new_output_path(output_dir: str, provider_name: str, ext: str = "png") -> str:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        filename = f"{provider_name}_{uuid.uuid4().hex}.{ext}"
        return str(Path(output_dir) / filename)


class PlaceholderProvider(ImageProvider):
    """No network, no API key, no GPU. Produces a real, valid image file
    so every downstream consumer (thumbnails, file size checks, the
    smoke tests) has something real to work with. Use this to build and
    test the entire Image Studio pipeline before wiring up a paid or
    self-hosted provider."""

    name = "placeholder"

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        seed = seed if seed is not None else int(time.time() * 1000) % (2**31)
        path = self._new_output_path(output_dir, self.name, ext="png")
        self._write_image(path, width, height, prompt, seed)
        return GenerationResult(
            output_path=path,
            provider=self.name,
            model=model or "placeholder-v1",
            width=width,
            height=height,
            seed=seed,
            raw={"note": "locally generated placeholder, no external API called"},
        )

    def _write_image(self, path: str, width: int, height: int, prompt: str, seed: int) -> None:
        try:
            from PIL import Image, ImageDraw  # type: ignore

            # Deterministic-ish background color from the seed so
            # different prompts/seeds are visually distinguishable.
            r = (seed * 47) % 200 + 30
            g = (seed * 97) % 200 + 30
            b = (seed * 151) % 200 + 30
            img = Image.new("RGB", (max(1, width), max(1, height)), (r, g, b))
            draw = ImageDraw.Draw(img)
            label = f"PLACEHOLDER\nseed={seed}\n{prompt[:80]}"
            draw.multiline_text((10, 10), label, fill=(255, 255, 255))
            img.save(path, format="PNG")
        except ImportError:
            # Pillow isn't installed -- fall back to a hand-built,
            # spec-valid 8x8 solid-color PNG so we never fail purely for
            # lack of an imaging library.
            Path(path).write_bytes(self._minimal_png(seed))

    @staticmethod
    def _minimal_png(seed: int) -> bytes:
        """Builds a tiny valid 8x8 RGB PNG by hand (stdlib zlib only)."""
        width = height = 8
        r, g, b = (seed * 47) % 256, (seed * 97) % 256, (seed * 151) % 256

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (
                struct.pack(">I", len(data))
                + tag
                + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        sig = b"\x89PNG\r\n\x1a\n"
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        raw_row = bytes([0]) + bytes([r, g, b] * width)
        raw = raw_row * height
        idat = zlib.compress(raw)
        return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


class ComfyUIProvider(ImageProvider):
    """Adapter for a self-hosted ComfyUI instance.

    ComfyUI's API is graph-based rather than a single "generate" call:
    you submit a workflow (a JSON node graph), poll history for
    completion, then fetch the produced image bytes. This adapter ships
    a minimal, standard txt2image graph (checkpoint -> CLIP encode
    (positive/negative) -> empty latent -> KSampler -> VAE decode ->
    save image) that works with any standard SD-family checkpoint.

    Configure via env vars (or `extra` overrides per-call):
      COMFYUI_BASE_URL   default "http://127.0.0.1:8188"
      COMFYUI_CHECKPOINT default "sd_xl_base_1.0.safetensors"

    You will very likely need to adjust the checkpoint name to match
    what's actually loaded in your ComfyUI instance -- pass
    `extra={"checkpoint": "..."}` to override per-request without
    touching code.
    """

    name = "comfyui"

    def __init__(self, base_url: Optional[str] = None, checkpoint: Optional[str] = None):
        self.base_url = (base_url or os.environ.get("COMFYUI_BASE_URL", "http://127.0.0.1:8188")).rstrip("/")
        self.checkpoint = checkpoint or os.environ.get("COMFYUI_CHECKPOINT", "sd_xl_base_1.0.safetensors")

    def is_configured(self) -> bool:
        # No key required -- ComfyUI is self-hosted. We consider it
        # "configured" as soon as a base URL is set; reachability is
        # only verified at generation time.
        return bool(self.base_url)

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        extra = extra or {}
        checkpoint = extra.get("checkpoint", model or self.checkpoint)
        steps = int(extra.get("steps", 20))
        cfg = float(extra.get("cfg", 7.0))
        sampler_name = extra.get("sampler_name", "euler")
        seed = seed if seed is not None else int(time.time() * 1000) % (2**31)

        client_id = uuid.uuid4().hex
        workflow = self._build_workflow(
            checkpoint, prompt, negative_prompt, width, height, seed, steps, cfg, sampler_name
        )
        payload = {"prompt": workflow, "client_id": client_id}
        result = self._post_json(f"{self.base_url}/prompt", {"Content-Type": "application/json"}, payload, timeout=60)
        prompt_id = result.get("prompt_id")
        if not prompt_id:
            raise ProviderError(f"comfyui did not return a prompt_id: {result}")

        history = self._poll_history(prompt_id, timeout_s=int(extra.get("poll_timeout", 300)))
        image_ref = self._extract_image_ref(history, prompt_id)
        image_bytes = self._get_bytes(
            f"{self.base_url}/view?filename={image_ref['filename']}"
            f"&subfolder={image_ref.get('subfolder', '')}&type={image_ref.get('type', 'output')}",
            headers=None,
            timeout=60,
        )
        path = self._new_output_path(output_dir, self.name, ext="png")
        Path(path).write_bytes(image_bytes)

        return GenerationResult(
            output_path=path,
            provider=self.name,
            model=checkpoint,
            width=width,
            height=height,
            seed=seed,
            raw={"prompt_id": prompt_id},
        )

    def _poll_history(self, prompt_id: str, timeout_s: int) -> dict:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            history = self._get_json(f"{self.base_url}/history/{prompt_id}", None, timeout=30)
            if prompt_id in history:
                return history[prompt_id]
            time.sleep(2)
        raise ProviderError(f"comfyui generation timed out waiting on prompt {prompt_id}")

    @staticmethod
    def _extract_image_ref(history_entry: dict, prompt_id: str) -> Dict[str, str]:
        outputs = history_entry.get("outputs", {})
        for node_output in outputs.values():
            images = node_output.get("images") or []
            if images:
                return images[0]
        raise ProviderError(f"comfyui history for {prompt_id} contained no images")

    @staticmethod
    def _build_workflow(
        checkpoint: str, prompt: str, negative_prompt: str,
        width: int, height: int, seed: int, steps: int, cfg: float, sampler_name: str,
    ) -> dict:
        # Standard minimal ComfyUI txt2image graph. Node IDs are
        # arbitrary strings -- ComfyUI just needs internal consistency.
        return {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt, "clip": ["1", 1]}},
            "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": sampler_name,
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
            },
            "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
            "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "storyforge"}},
        }


class OpenAIImageProvider(ImageProvider):
    """OpenAI Images API (gpt-image-1 / dall-e-3 / dall-e-2)."""

    name = "openai"
    _SUPPORTED_SIZES = {"1024x1024", "1024x1792", "1792x1024", "512x512", "256x256"}

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        if not self.api_key:
            raise ProviderError("OPENAI_API_KEY is not set")
        extra = extra or {}
        model = model or "gpt-image-1"
        size = self._closest_size(width, height)

        # OpenAI's image endpoint has no negative-prompt or seed
        # concept; negative_prompt is folded into the prompt itself so
        # the intent isn't silently dropped, and seed is recorded as
        # requested-but-unsupported in the returned metadata.
        full_prompt = prompt
        if negative_prompt:
            full_prompt = f"{prompt}\n\nAvoid: {negative_prompt}"

        payload = {"model": model, "prompt": full_prompt, "size": size, "n": 1}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        result = self._post_json("https://api.openai.com/v1/images/generations", headers, payload, timeout=120)

        item = (result.get("data") or [{}])[0]
        path = self._new_output_path(output_dir, self.name, ext="png")
        if item.get("b64_json"):
            Path(path).write_bytes(base64.b64decode(item["b64_json"]))
        elif item.get("url"):
            Path(path).write_bytes(self._get_bytes(item["url"], None, timeout=60))
        else:
            raise ProviderError(f"openai response contained neither b64_json nor url: {result}")

        out_w, out_h = (int(x) for x in size.split("x"))
        return GenerationResult(
            output_path=path,
            provider=self.name,
            model=model,
            width=out_w,
            height=out_h,
            seed=seed,  # not supported upstream; passed through for record-keeping
            raw={"requested_seed_unsupported_by_provider": seed is not None},
        )

    @classmethod
    def _closest_size(cls, width: int, height: int) -> str:
        exact = f"{width}x{height}"
        if exact in cls._SUPPORTED_SIZES:
            return exact
        if width == height:
            return "1024x1024"
        return "1792x1024" if width > height else "1024x1792"


class HiggsfieldImageAdapter(ImageProvider):
    """Adapter for Higgsfield's image generation API.

    Higgsfield's HTTP API surface is not bundled with this repo and can
    change; rather than hardcode a brittle guess, this adapter reads
    both the endpoint and the key from the environment so it can be
    pointed at whatever Higgsfield endpoint/schema is current without a
    code change. It participates in the same provider interface as
    everything else so Image Studio can treat it identically once
    configured -- that's the "if available" in the spec: it's wired in
    and selectable, and it activates the moment credentials/endpoint
    are supplied.

    Configure via env vars:
      HIGGSFIELD_API_KEY   required
      HIGGSFIELD_API_URL   required, e.g. your workspace's image
                            generation endpoint

    Expected (adjust to match Higgsfield's current docs if their
    request/response shape differs): POST {prompt, negative_prompt,
    width, height, seed, model} with `Authorization: Bearer <key>`,
    returning JSON with either an `image_url` or base64 `image_b64`.
    """

    name = "higgsfield"

    def __init__(self, api_key: Optional[str] = None, api_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("HIGGSFIELD_API_KEY")
        self.api_url = api_url or os.environ.get("HIGGSFIELD_API_URL")

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_url)

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        if not self.api_key or not self.api_url:
            raise ProviderError(
                "higgsfield provider is not configured -- set HIGGSFIELD_API_KEY and "
                "HIGGSFIELD_API_URL to enable it"
            )
        payload = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "seed": seed,
            "model": model or "default",
            **(extra or {}),
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        result = self._post_json(self.api_url, headers, payload, timeout=120)

        path = self._new_output_path(output_dir, self.name, ext="png")
        if result.get("image_b64"):
            Path(path).write_bytes(base64.b64decode(result["image_b64"]))
        elif result.get("image_url"):
            Path(path).write_bytes(self._get_bytes(result["image_url"], None, timeout=60))
        else:
            raise ProviderError(f"higgsfield response contained neither image_b64 nor image_url: {result}")

        return GenerationResult(
            output_path=path,
            provider=self.name,
            model=model or "default",
            width=width,
            height=height,
            seed=result.get("seed", seed),
            raw={k: v for k, v in result.items() if k not in ("image_b64",)},
        )


_IMAGE_PROVIDERS = {
    "placeholder": PlaceholderProvider,
    "comfyui": ComfyUIProvider,
    "openai": OpenAIImageProvider,
    "higgsfield": HiggsfieldImageAdapter,
}


def _register_video_pipeline() -> None:
    # Deferred import avoids a circular import (video_pipeline_provider
    # imports ImageProvider/GenerationResult from this module/models).
    from core.image.video_pipeline_provider import VideoPipelineImageProvider
    _IMAGE_PROVIDERS["video_pipeline"] = VideoPipelineImageProvider


_register_video_pipeline()


def get_image_provider(name: str) -> ImageProvider:
    if name not in _IMAGE_PROVIDERS:
        raise ProviderError(
            f"Unknown image provider '{name}'. Available: {', '.join(_IMAGE_PROVIDERS.keys())}. "
            f"Add new adapters by subclassing ImageProvider and registering in _IMAGE_PROVIDERS."
        )
    return _IMAGE_PROVIDERS[name]()


def list_image_providers() -> Dict[str, bool]:
    """Name -> is_configured, without making any network calls."""
    return {name: cls().is_configured() for name, cls in _IMAGE_PROVIDERS.items()}
