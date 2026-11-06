from typing import Dict, FrozenSet


class AgentScopeError(PermissionError):
    """Raised when an agent asks to do something outside its own scope. Nothing runs."""


# Actions no agent may ever take. Joshua is the only approver, and nothing goes live from an agent.
FORBIDDEN_FOR_ALL: FrozenSet[str] = frozenset({"approve", "publish_live"})

# Each agent does exactly the jobs it was built for, plus its own mission-board steps.
AGENT_SCOPES: Dict[str, FrozenSet[str]] = {
    "video_studio-agent": frozenset({"claim", "post_proof", "render_video"}),
    "book_maker-agent": frozenset({"claim", "post_proof", "generate_book"}),
    "merch_factory-agent": frozenset({"claim", "post_proof", "list_merch"}),
    "bosslisters-agent": frozenset({"claim", "post_proof", "list_on_ebay"}),
}


def assert_allowed(agent: str, action: str) -> None:
    """Refuse any action that is not in the agent's own scope. Call before doing the work."""
    if action in FORBIDDEN_FOR_ALL:
        raise AgentScopeError(f"{agent} may never do '{action}': only Joshua approves")
    allowed = AGENT_SCOPES.get(agent)
    if allowed is None:
        raise AgentScopeError(f"unknown agent '{agent}': no scope defined")
    if action not in allowed:
        raise AgentScopeError(f"{agent} is not scoped for '{action}'")
