"""
REAL-PROVIDER tests (optional).

These call a live Gemini endpoint when GEMINI_API_KEY / AI_ENGINE_GEMINI_KEY is set.
Without a key they are skipped — clearly distinct from stub/harness tests.
"""
from __future__ import annotations

import asyncio
import os

import pytest

from app.provider.base import CompletionRequest, get_provider

_KEY = (
    os.environ.get("GEMINI_API_KEY")
    or os.environ.get("AI_ENGINE_GEMINI_KEY")
    or os.environ.get("GOOGLE_API_KEY")
    or ""
).strip()

pytestmark = pytest.mark.skipif(not _KEY, reason="No live Gemini key — stub/harness tests cover CI")


def test_real_gemini_short_completion():
    provider = get_provider("gemini")

    async def _run():
        return await provider.complete(
            CompletionRequest(
                messages=[
                    {"role": "system", "content": "Reply in one short English sentence."},
                    {"role": "user", "content": "Say hello to Salon Larvendo customers."},
                ],
                model="gemini-2.0-flash",
                api_key=_KEY,
                max_tokens=64,
                temperature=0.2,
            )
        )

    result = asyncio.run(_run())
    assert (result.text or "").strip()
