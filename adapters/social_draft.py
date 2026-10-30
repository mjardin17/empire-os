"""
Social post drafts as mission board orders. DRAFT ONLY: this never approves and never publishes.

A draft becomes an open order, and its caption is posted as proof for human review. Approval
stays with the mission board's fail-closed gate (MissionBoardAdapter.approve). Nothing here
calls a platform API.

Duplicates are blocked by a content hash, so retries are safe.
"""
import hashlib
import json
import os
from typing import Any, Dict, Optional, Set

ALLOWED_PLATFORMS = {"instagram", "facebook", "tiktok", "youtube", "pinterest", "x", "linkedin"}
CAPTION_LIMITS = {"x": 280}  # hard limits per platform; others are not enforced here
DEFAULT_CAPTION_LIMIT = 2200
AGENT = "social-draft"


class DraftError(ValueError):
    """Raised when a draft breaks a rule. Callers should show the message to the user."""


def validate_draft(platform: str, caption: str, media_path: Optional[str] = None) -> Dict[str, Any]:
    if platform not in ALLOWED_PLATFORMS:
        raise DraftError(f"Unknown platform '{platform}'. Allowed: {sorted(ALLOWED_PLATFORMS)}")
    text = (caption or "").strip()
    if not text:
        raise DraftError("Caption is empty")
    limit = CAPTION_LIMITS.get(platform, DEFAULT_CAPTION_LIMIT)
    if len(text) > limit:
        raise DraftError(f"Caption is {len(text)} characters; {platform} allows {limit}")
    if media_path is not None and not os.path.isfile(media_path):
        raise DraftError(f"Media file not found: {media_path}")
    return {"platform": platform, "caption": text, "media_path": media_path}


def content_hash(draft: Dict[str, Any]) -> str:
    canonical = json.dumps(draft, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class SocialDraftAdapter:
    """Creates draft orders on the mission board. Holds the set of seen hashes for dedupe."""

    def __init__(self, board: Any, seen_hashes: Optional[Set[str]] = None):
        self.board = board
        self.seen_hashes: Set[str] = set(seen_hashes or ())

    def submit_draft(self, platform: str, caption: str, media_path: Optional[str] = None) -> Dict[str, Any]:
        draft = validate_draft(platform, caption, media_path)
        digest = content_hash(draft)
        if digest in self.seen_hashes:
            return {"status": "duplicate", "hash": digest, "order_id": None}

        title = f"[social-draft] {platform} {digest[:12]}"
        order = self.board.post_order(title=title, description=json.dumps(draft, ensure_ascii=False),
                                      created_by=AGENT)
        order_id = (order.get("order") or {}).get("id") if isinstance(order, dict) else None
        if not order_id:
            return {"status": "failed", "hash": digest, "order_id": None, "error": order.get("error")}

        proof = self.board.post_proof(order_id, AGENT, proof=draft["caption"])
        self.seen_hashes.add(digest)
        return {"status": "draft", "hash": digest, "order_id": order_id,
                "proof_status": proof.get("status"), "published": False}
