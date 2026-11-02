"""Agent scope and agent memory: each agent does only its own job, and remembers its failures. No server, no network."""
import pytest

from adapters.agent_memory import AgentMemory, signature
from adapters.agent_scope import AgentScopeError, assert_allowed
from adapters.book_maker import publish_blockers, publish_score
from adapters.roof import EmpireRoof


@pytest.mark.parametrize("agent,action", [
    ("book_maker-agent", "generate_book"),
    ("video_studio-agent", "render_video"),
    ("merch_factory-agent", "list_merch"),
    ("bosslisters-agent", "list_on_ebay"),
    ("book_maker-agent", "claim"),
])
def test_agent_allowed_its_own_job(agent, action):
    assert_allowed(agent, action)


@pytest.mark.parametrize("agent,action", [
    ("book_maker-agent", "approve"),
    ("video_studio-agent", "publish_live"),
    ("book_maker-agent", "render_video"),
    ("merch_factory-agent", "generate_book"),
])
def test_agent_refused_anything_outside_its_scope(agent, action):
    with pytest.raises(AgentScopeError):
        assert_allowed(agent, action)


def test_unknown_agent_is_refused():
    with pytest.raises(AgentScopeError):
        assert_allowed("rogue-agent", "claim")


def test_memory_recalls_failures_for_the_same_agent_and_action(tmp_path):
    memory = AgentMemory(str(tmp_path))
    memory.remember("book_maker-agent", "generate_book", "price not set by Joshua", "Ask Joshua for a price")
    memory.remember("video_studio-agent", "render_video", "ffmpeg missing", "Install ffmpeg")

    lessons = memory.recall("book_maker-agent", "generate_book")

    assert [l["lesson"] for l in lessons] == ["Ask Joshua for a price"]
    assert memory.recall("book_maker-agent", "render_video") == []


def test_memory_matches_the_same_failure_across_different_ids():
    assert signature("job 123 failed at row 45") == signature("job 9 failed at row 7")


def test_memory_is_empty_for_a_new_agent(tmp_path):
    assert AgentMemory(str(tmp_path)).recall("bosslisters-agent") == []


def test_memory_rejects_a_bad_agent_name(tmp_path):
    with pytest.raises(ValueError):
        AgentMemory(str(tmp_path)).recall("../escape")


def test_placeholder_book_is_not_publish_ready():
    blockers = publish_blockers(
        title="Roof Proof Manual",
        description="Test manuscript 'Roof Proof Manual' formatted end-to-end",
        price="$0.00",
        has_cover=False,
    )
    assert "title looks like a placeholder" in blockers
    assert "description is a placeholder or empty" in blockers
    assert "price not set by Joshua" in blockers
    assert "no professionally done cover" in blockers


def test_real_words_that_contain_placeholder_substrings_are_not_blocked():
    blockers = publish_blockers(
        title="The Latest Contest Playbook",
        description="The latest tactics for winning local contests, explained step by step.",
        price="$9.99",
        has_cover=True,
    )
    assert blockers == []


def test_real_book_with_title_description_price_and_cover_has_no_blockers():
    blockers = publish_blockers(
        title="The Quiet Ledger",
        description="A practical guide to keeping a household budget without the stress.",
        price="$12.99",
        has_cover=True,
    )
    assert blockers == []


def test_publish_score_is_share_of_checks_passed():
    assert publish_score([]) == 1.0
    assert publish_score(["price not set by Joshua"]) == 0.75
    assert publish_score(["title looks like a placeholder", "description is a placeholder or empty",
                          "price not set by Joshua", "no professionally done cover"]) == 0.0


@pytest.mark.parametrize("ok,quality,expected", [
    (False, None, ("failure", 0.0)),
    (False, 0.5, ("failure", 0.0)),
    (True, None, ("success", 1.0)),
    (True, 1.0, ("success", 1.0)),
    (True, 0.75, ("partial", 0.75)),
])
def test_outcome_scores_quality_not_just_completion(ok, quality, expected):
    assert EmpireRoof._outcome(ok, quality) == expected
