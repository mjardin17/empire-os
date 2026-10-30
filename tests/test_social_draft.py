"""Social drafts stay drafts: validation, dedupe, and no approve or publish call. Uses a fake board, no server."""
import json

import pytest

from adapters.social_draft import DraftError, SocialDraftAdapter, content_hash, validate_draft


class FakeBoard:
    def __init__(self, fail_post=False):
        self.posted = []
        self.proofs = []
        self.approve_calls = 0
        self.fail_post = fail_post

    def post_order(self, title, description="", created_by="empire-os", requires_verification=False):
        self.posted.append({"title": title, "description": description, "created_by": created_by})
        if self.fail_post:
            return {"status": "REJECTED", "order": None, "error": "boom"}
        return {"status": "COMPLETED", "order": {"id": f"ord_{len(self.posted)}", "status": "open"}, "error": None}

    def post_proof(self, order_id, agent, proof, verification=None):
        self.proofs.append({"order_id": order_id, "agent": agent, "proof": proof})
        return {"status": "COMPLETED"}

    def approve(self, *args, **kwargs):
        self.approve_calls += 1
        raise AssertionError("social drafts must never call approve")


def test_rejects_unknown_platform():
    with pytest.raises(DraftError, match="Unknown platform"):
        validate_draft("myspace", "hello")


def test_rejects_empty_caption():
    with pytest.raises(DraftError, match="empty"):
        validate_draft("instagram", "   ")


def test_enforces_x_280_limit():
    with pytest.raises(DraftError, match="280"):
        validate_draft("x", "a" * 281)
    assert validate_draft("x", "a" * 280)["platform"] == "x"


def test_rejects_missing_media_file(tmp_path):
    with pytest.raises(DraftError, match="Media file not found"):
        validate_draft("tiktok", "hi", media_path=str(tmp_path / "nope.mp4"))


def test_hash_is_stable_and_order_independent():
    a = {"platform": "x", "caption": "hi", "media_path": None}
    b = dict(reversed(list(a.items())))
    assert content_hash(a) == content_hash(b)


def test_submit_creates_open_order_with_proof_and_never_approves():
    board = FakeBoard()
    result = SocialDraftAdapter(board).submit_draft("instagram", "New drop today")
    assert result["status"] == "draft"
    assert result["published"] is False
    assert board.posted[0]["created_by"] == "social-draft"
    assert json.loads(board.posted[0]["description"])["caption"] == "New drop today"
    assert board.proofs == [{"order_id": "ord_1", "agent": "social-draft", "proof": "New drop today"}]
    assert board.approve_calls == 0


def test_duplicate_draft_is_blocked():
    board = FakeBoard()
    adapter = SocialDraftAdapter(board)
    adapter.submit_draft("facebook", "Same post")
    second = adapter.submit_draft("facebook", "Same post")
    assert second["status"] == "duplicate"
    assert len(board.posted) == 1


def test_seen_hashes_survive_restart():
    board = FakeBoard()
    first = SocialDraftAdapter(board)
    first.submit_draft("pinterest", "Pin it")
    restarted = SocialDraftAdapter(FakeBoard(), seen_hashes=first.seen_hashes)
    assert restarted.submit_draft("pinterest", "Pin it")["status"] == "duplicate"


def test_failed_order_is_not_recorded_as_seen():
    adapter = SocialDraftAdapter(FakeBoard(fail_post=True))
    result = adapter.submit_draft("tiktok", "Try again later")
    assert result["status"] == "failed"
    assert result["order_id"] is None
    assert adapter.seen_hashes == set()
