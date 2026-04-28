# HEXA SALON AI Bot

Custom-built AI chatbot — no OpenAI, no external LLM. Pure Python.

## How it works

```
Customer types → Intent Classifier (scikit-learn TF-IDF + SVM)
                        ↓
               Conversation State Machine
                        ↓
               Salon APIs (existing Node.js)
                        ↓
               Reply to Customer
```

## Features
- Book appointments through chat
- Check services and prices
- Find branch locations
- Check staff availability
- Supports English + basic Sinhala phrases
- No internet needed, no API costs

## Setup

```powershell
cd ai_bot
.\start.ps1
```

Or manually:
```bash
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API

- `POST /chat` — send a message
- `DELETE /chat/{session_id}` — clear session
- `GET /health` — health check
- `GET /docs` — Swagger UI

## Add more training phrases

Edit `training_data.py` — add more phrases to any intent to improve accuracy.

## Add new intents

1. Add phrases to `training_data.py`
2. Handle the intent in `conversation.py` → `handle_message()`
