from langgraph.graph import StateGraph, END
from typing import TypedDict, List
from core.self_healing import SelfHealingSystem

healing = SelfHealingSystem()

class AgentState(TypedDict):
    messages: List[str]
    next: str

def supervisor_node(state):
    try:
        return {"messages": state["messages"] + ["Task completed successfully"], "next": "END"}
    except Exception as e:
        recovery = healing.report_error(e, state)
        return {"messages": state["messages"] + [f"Recovered: {recovery}"], "next": "END"}

def build_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("supervisor", supervisor_node)
    workflow.set_entry_point("supervisor")
    workflow.add_edge("supervisor", END)
    return workflow.compile()

print("EmpireForge Agent Graph with healing ready")
