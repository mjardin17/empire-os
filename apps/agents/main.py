import os
from fastapi import FastAPI
import uvicorn
from agent_graph import build_graph
from core.self_healing import SelfHealingSystem

app = FastAPI(title="EmpireForge Agent v2.1")
healing = SelfHealingSystem()
graph = build_graph()

@app.get("/")
async def root():
    return {"status": "EmpireForge Agent v2.1 ready (bottlenecks fixed)"}

@app.post("/run")
async def run_task(task: str):
    try:
        result = graph.invoke({"messages": [task]})
        return {"result": result.get("messages", ["Success"])}
    except Exception as e:
        action = healing.report_error(e, task)
        return {"status": "healing", "action": action, "error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=4)
