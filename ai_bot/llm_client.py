"""
NVIDIA NIM LLM client — OpenAI-compatible API
Model: meta/llama-3.1-8b-instruct
"""
import os
from openai import AsyncOpenAI

NVIDIA_API_KEY  = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL           = "meta/llama-3.1-8b-instruct"

_client: AsyncOpenAI | None = None

def get_client() -> AsyncOpenAI | None:
    global _client
    if not NVIDIA_API_KEY:
        return None
    if _client is None:
        _client = AsyncOpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=NVIDIA_API_KEY,
        )
    return _client


SYSTEM_PROMPT = """You are an intelligent AI assistant for **Xane Salon**, a professional hair and beauty salon in Sri Lanka.

You assist two types of users:
1. **Customers** — help with bookings, services, prices, branch info, and general queries
2. **Staff/Managers** — help interpret salon data: revenue, appointments, staff performance, inventory

Guidelines:
- Be friendly, concise, and professional
- Respond in the same language as the user (English or Sinhala)
- Use markdown: **bold**, bullet points (•), line breaks for clarity
- Keep responses under 200 words
- For data questions you cannot answer (no live data), suggest: "Check the dashboard or ask your manager"
- Never make up specific numbers — only use data provided in context
- For booking requests, guide them to say "book appointment"
"""


async def llm_reply(
    user_message: str,
    context: str = "",
    history: list | None = None,
) -> str | None:
    """
    Get a natural language reply from NVIDIA NIM.
    Returns None if LLM is not configured or call fails.
    """
    client = get_client()
    if not client:
        return None

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add recent conversation history (last 6 turns)
    if history:
        for h in history[-6:]:
            role = "user" if h.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": h.get("text", "")})

    # Inject live salon data context if available
    if context:
        messages.append({
            "role": "system",
            "content": f"Live salon data for this query:\n{context}",
        })

    messages.append({"role": "user", "content": user_message})

    try:
        completion = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.35,
            max_tokens=350,
            stream=False,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"[NIM LLM] Error: {e}")
        return None


def is_available() -> bool:
    """Returns True if NVIDIA API key is configured."""
    return bool(NVIDIA_API_KEY)
