import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.learn_loop import LearnLoopAdapter

FACTORY = "LEARN_LOOP"
FIXTURE_FACTORY = "FIXTURE_FACTORY"


def main():
    logger.info("Starting Piece 7 Verification Run: Learn Loop adapter (scoring stub)", factory=FACTORY)
    adapter = LearnLoopAdapter()  # default: output/learn_loop/events.jsonl
    marker = f"fixture-{uuid.uuid4().hex[:8]}"
    event = {
        "factory": FIXTURE_FACTORY, "action": "fixture_action", "outcome": "success",
        "score": 0.5, "metadata": {"marker": marker, "note": "test fixture, no real sales data"},
    }

    stored = adapter.submit_event(event)
    # Read back from a fresh adapter instance, straight off disk
    reread = [e for e in LearnLoopAdapter().read_events(FIXTURE_FACTORY) if e["metadata"].get("marker") == marker]
    roundtrip = (
        stored["status"] == "COMPLETED" and len(reread) == 1
        and all(reread[0][k] == event[k] for k in ("factory", "action", "outcome", "score", "metadata"))
        and reread[0]["event_id"] == stored["event"]["event_id"]
    )

    # A second event so the summary has something to average (still fixtures)
    adapter.submit_event({**event, "score": 1.0, "metadata": {"marker": marker}})
    adapter.submit_event({**event, "score": None, "outcome": "pending", "metadata": {"marker": marker}})
    ours = [e for e in adapter.read_events(FIXTURE_FACTORY) if e["metadata"].get("marker") == marker]
    scores = [e["score"] for e in ours if e["score"] is not None]
    summary = adapter.score_summary(FIXTURE_FACTORY)[FIXTURE_FACTORY]
    # The file is append-only across runs, so compare against this run's events plus anything earlier
    all_fixture = adapter.read_events(FIXTURE_FACTORY)
    all_scores = [e["score"] for e in all_fixture if e["score"] is not None]
    summary_ok = (
        len(scores) == 2 and sum(scores) / 2 == 0.75
        and summary["count"] == len(all_fixture)
        and summary["scored_count"] == len(all_scores)
        and abs(summary["mean_score"] - sum(all_scores) / len(all_scores)) < 1e-9
    )

    # Invalid events are rejected and NOT stored
    before = len(adapter.read_events())
    bad = [
        adapter.submit_event({"factory": FIXTURE_FACTORY, "action": "a", "outcome": "great"}),
        adapter.submit_event({"factory": "", "action": "a", "outcome": "success"}),
        adapter.submit_event({"factory": FIXTURE_FACTORY, "action": "a", "outcome": "success", "score": "high"}),
        adapter.submit_event({"factory": FIXTURE_FACTORY, "action": "a", "outcome": "success", "score": float("nan")}),
        adapter.submit_event({"factory": FIXTURE_FACTORY, "action": "a", "outcome": "success", "metadata": ["x"]}),
    ]
    rejected_ok = all(b["status"] == "REJECTED" for b in bad) and len(adapter.read_events()) == before

    print("\n--- PIECE 7 PROOF RESULT ---")
    print(f"Storage: {adapter.path}")
    print(f"Stored event_id: {stored['event']['event_id'] if stored['event'] else None}  status: {stored['status']}")
    print(f"Read back from disk: {reread[0] if reread else None}")
    print(f"Round-trip equal: {roundtrip}")
    print(f"Score summary ({FIXTURE_FACTORY}): {summary}")
    print(f"Invalid events rejected and not stored: {rejected_ok}")

    if roundtrip and summary_ok and rejected_ok:
        print("PIECE 7 VERIFIED: event submitted, read back from output/learn_loop/events.jsonl, round-trips; score summary stub works; invalid events rejected.\n")
    else:
        print(f"PIECE 7 FAILED: roundtrip={roundtrip} summary_ok={summary_ok} rejected_ok={rejected_ok}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
