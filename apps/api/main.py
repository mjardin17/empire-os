from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

app = FastAPI(
    title="Empire OS API",
    description="Viral Engine — AI YouTube factory management system",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "empire-os-api"}

@app.get("/status")
async def status():
    return {
        "channels": ["Gods & Glory", "Machine Learning", "Little Olympus"],
        "pipeline": "operational",
        "council_bots": 9,
    }

@app.get("/agents")
async def agents():
    return {
        "agents": [
            {"name": "Claude", "role": "DevOps/Architecture", "status": "active"},
            {"name": "Gemini", "role": "Research/Scripts", "status": "active"},
            {"name": "Goose", "role": "Orchestration", "status": "active"},
            {"name": "ChatGPT", "role": "Copy", "status": "active"},
        ]
    }

@app.get("/models")
async def models():
    return {
        "active_models": ["claude-sonnet-4-6", "gemini-pro", "gpt-4o"],
        "local": ["ollama/llama3"]
    }

@app.get("/tasks")
async def tasks():
    return {
        "pending": [],
        "in_progress": [],
        "completed": []
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
