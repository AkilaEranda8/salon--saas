"""
Zane Salon AI Bot — FastAPI server
Run: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid

from intent_classifier import classifier
from conversation import handle_message, reset_session
from insights import analyze

app = FastAPI(title="Zane Salon AI Bot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://main.zanesalon.com", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    intent: str
    confidence: float


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request):
    session_id = req.session_id or str(uuid.uuid4())
    message    = req.message.strip()

    # Extract JWT cookie forwarded from the browser — enables management queries
    cookie_header = request.headers.get("cookie", "")
    token = None
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith("token="):
            token = part[len("token="):]
            break

    if not message:
        return ChatResponse(
            session_id=session_id,
            reply="Please say something — I'm here to help!",
            intent="unknown",
            confidence=0.0,
        )

    result     = classifier.predict(message)
    intent     = result["intent"]
    confidence = result["confidence"]

    reply = await handle_message(session_id, message, intent, token=token)

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        intent=intent,
        confidence=confidence,
    )


@app.delete("/chat/{session_id}")
async def clear_session(session_id: str):
    reset_session(session_id)
    return {"message": "Session cleared"}


@app.post("/insights")
async def insights(data: dict):
    """
    Accepts report data and returns AI-generated insights.
    Payload: { revenue, services, staff, appointments, expenses, customers }
    """
    results = analyze(data)
    return {"insights": results, "count": len(results)}


@app.get("/health")
def health():
    return {"status": "ok", "bot": "Zane Salon AI"}
