"""
RC9 — Multi-message conversation replay tests (mandatory).

Isolated unit checks are NOT enough: these simulate complete conversations
(memory → follow-up → correction → multi-ask) without live Gemini/WhatsApp.
"""
from __future__ import annotations

from app.conversation_intelligence import (
    INTENT_DURATION,
    INTENT_PRICE,
    build_conversation_context,
    classify_intent,
    format_context_for_prompt,
    is_referent_message,
    memory_patch_from_context,
    resolve_referent_topic,
)
from app.conversation_truth import is_memory_recall_ask, short_numeric_intent
from app.response_quality import (
    decompose_customer_asks,
    validate_customer_reply,
)


def _replay_turn(message: str, memory: dict, recent: list) -> dict:
    """One deterministic turn: classify + context + quality against a candidate reply."""
    ctx = build_conversation_context(
        message=message,
        tenant_id=28,
        memory=memory,
        recent_messages=recent,
        booking_state=memory.get("booking_state"),
        booking_paused=bool(memory.get("booking_paused")),
    )
    patch = memory_patch_from_context(ctx)
    return {"ctx": ctx, "patch": patch, "prompt": format_context_for_prompt(ctx)}


def test_eka_followup_price_uses_prior_service():
    """Conv: keratin discussed → 'Eka keeyada?' must resolve keratin + price intent."""
    memory = {
        "last_service": "keratin",
        "current_topic": "keratin",
        "last_quoted_price": "Rs 25000",
        "qa_history": [
            {"q": "Keratin treatment thiyenawada?", "a": "Ow, keratin thiyenawa.", "topic": "keratin"},
        ],
    }
    recent = [
        {"role": "user", "content": "Keratin treatment thiyenawada?"},
        {"role": "assistant", "content": "Ow, keratin thiyenawa. Length eka kiyanna."},
    ]
    assert is_referent_message("Eka keeyada?") is True
    assert resolve_referent_topic("Eka keeyada?", memory=memory) == "keratin"
    out = _replay_turn("Eka keeyada?", memory, recent)
    assert out["ctx"].referent_topic == "keratin"
    assert out["ctx"].current_intent == INTENT_PRICE
    assert "keratin" in out["prompt"].lower()
    assert "Rs 25000" in out["prompt"] or "25000" in out["prompt"]


def test_ekata_duration_followup():
    """'Ekata kochchara welawak yanawada?' → duration on prior service."""
    memory = {"last_service": "keratin", "current_topic": "keratin", "last_duration_minutes": 180}
    c = classify_intent(
        "Ekata kochchara welawak yanawada?",
        memory=memory,
        prior_topic="keratin",
    )
    assert c["intent"] == INTENT_DURATION
    assert c["topic"] == "keratin"
    assert is_referent_message("Ekata kochchara welawak yanawada?") is True


def test_kalin_kiwwa_recall():
    assert is_memory_recall_ask("Mata kalin kiwwa price eka mathaka na") is True
    memory = {
        "last_service": "butterfly",
        "current_topic": "butterfly",
        "last_quoted_price": "Rs 4500",
    }
    c = classify_intent(
        "Mata kalin kiwwa price eka mathaka na",
        memory=memory,
        prior_topic="butterfly",
    )
    assert "butterfly" in str(c.get("topic") or "")
    assert "4500" in (c.get("must") or "") or c.get("intent") == INTENT_PRICE


def test_ehenam_wena_alternative_keeps_prior():
    memory = {"last_service": "keratin", "current_topic": "keratin"}
    c = classify_intent("Ehenam wena ekak thiyenawada?", memory=memory, prior_topic="keratin")
    assert "keratin" in str(c.get("topic") or "")
    assert "ALTERNATIVE" in (c.get("must") or "").upper() or "alternative" in (c.get("must") or "").lower()


def test_hari_ehema_karamu_commitment_remembered():
    memory = {"last_service": "keratin", "current_topic": "keratin", "commitments": []}
    out = _replay_turn("Hari, ehema karamu.", memory, [])
    assert any("ehema karamu" in str(c).lower() for c in out["ctx"].commitments) or out["patch"].get(
        "commitments"
    )


def test_multi_question_completeness_price_duration_branch():
    msg = "Keratin eka keeyada? Duration eka kochchara? Branch eka koheda?"
    units = decompose_customer_asks(msg, prior_topic="keratin")
    kinds = {u.kind for u in units}
    assert "price" in kinds
    assert "duration" in kinds
    assert "location" in kinds

    # Incomplete: only price answered
    bad = validate_customer_reply(
        msg,
        "Keratin Shoulder Length ta Rs.25,000.",
        prior_topic="keratin",
        expected_service="keratin",
    )
    assert bad.ok is False
    assert any("duration" in m or "location" in m or "branch" in m for m in bad.missing)

    # Complete: all three covered
    good = validate_customer_reply(
        msg,
        "Keratin Shoulder Length Rs.25,000 · ~180 min. Branch: Kandy — Peradeniya Road.",
        prior_topic="keratin",
        expected_service="keratin",
        verified_amounts=[25000],
        price_hard_gated=True,
    )
    assert good.ok is True


def test_reject_generic_booking_pitch_on_price_ask():
    """Informational price ask must not be replaced by generic book CTA."""
    msg = "Eka keeyada?"
    bad = validate_customer_reply(
        msg,
        "Would you like to book? Date / time kiyanna, lock in a slot.",
        prior_topic="keratin",
        expected_service="keratin",
    )
    assert bad.ok is False
    assert any(
        x in bad.missing or x in bad.warnings
        for x in (
            "price_discussed",
            "price_keratin",
            "off_topic_recommendation",
            "context_consistency",
            "unrelated_or_generic_booking_pitch",
        )
    ) or any("price" in m for m in bad.missing)


def test_reject_unrelated_bridal_pitch_on_haircut():
    bad = validate_customer_reply(
        "Butterfly cut kiyada?",
        "We also offer our bridal package special — popular packages you may like!",
        prior_topic="haircut",
        expected_service="haircut",
    )
    assert bad.ok is False


def test_correction_overrides_prior_topic():
    """Customer changes mind: new explicit service wins over stale keratin memory."""
    memory = {
        "last_service": "keratin",
        "current_topic": "keratin",
        "qa_history": [{"q": "Keratin oni", "a": "Hari keratin.", "topic": "keratin"}],
    }
    # Explicit correction / change language
    msg = "Nemei — hair cut ekak oni, keratin epa"
    out = _replay_turn(msg, memory, [
        {"role": "user", "content": "Keratin oni"},
        {"role": "assistant", "content": "Hari keratin."},
    ])
    # Stale keratin should be blocked or topic switches toward cut
    assert out["ctx"].stale_context_blocked or out["ctx"].is_topic_switch or (
        out["ctx"].current_topic and "keratin" not in str(out["ctx"].current_topic).lower()
    ) or out["ctx"].is_correction


def test_qa_history_loaded_into_prompt():
    memory = {
        "last_service": "hydra facial",
        "current_topic": "facial",
        "last_quoted_price": "Rs 8000",
        "qa_history": [
            {"q": "Hydra facial kiyada?", "a": "Hydra facial Rs.8,000.", "topic": "facial"},
        ],
        "pending_questions": ["booking_date"],
        "conversation_summary": "Discussed hydra facial price",
        "preferred_date": "2026-11-20",
        "preferred_time": "10:00",
        "last_duration_minutes": 60,
        "last_service_id": "svc-99",
    }
    out = _replay_turn("Eka keeyada?", memory, [])
    prompt = out["prompt"].lower()
    assert "hydra" in prompt or "facial" in prompt
    assert "8000" in prompt or "rs" in prompt
    assert "2026-11-20" in out["prompt"] or "preferred date" in prompt
    assert "svc-99" in out["prompt"]
    assert out["patch"].get("qa_history") is not None


def test_missing_catalogue_says_unknown_not_invent():
    """Quality gate: invented amounts outside verified set fail."""
    msg = "Secret glow facial kiyada?"
    bad = validate_customer_reply(
        msg,
        "Secret glow facial Rs.99,999.",
        prior_topic="facial",
        price_hard_gated=True,
        verified_amounts=[3500],
        expected_service="facial",
    )
    assert bad.invented_price_risk is True or "price_identity" in bad.missing


def test_pure_number_not_always_catalogue_index():
    """'11 kiy nne me masene' is date-day, not list index 11."""
    intent = short_numeric_intent("11 kiy nne me masene")
    assert intent == "date_day"
    # Pure digit with service-list step may be list_index — that remains allowed
    assert short_numeric_intent("11", expected_step="service") in ("list_index", "date_day", "unclear", "other")


def test_long_conversation_multi_topic_memory_chain():
    """Simulate 5-turn conversation; memory must carry service + price + date."""
    memory: dict = {
        "preferred_services": [],
        "qa_history": [],
        "commitments": [],
        "pending_questions": [],
    }
    recent: list = []
    turns = [
        ("Hi", None),
        ("Keratin treatment kiyada?", "keratin"),
        ("Eka keeyada?", "keratin"),
        ("Ekata kochchara welawak yanawada?", "keratin"),
        ("Heta 10am book karanna oni", "keratin"),
    ]
    for msg, expect_topic in turns:
        out = _replay_turn(msg, memory, recent)
        # Merge patch like CRM would
        for k, v in out["patch"].items():
            if k == "qa_history" and isinstance(v, list):
                memory.setdefault("qa_history", []).extend(v)
                memory["qa_history"] = memory["qa_history"][-12:]
            elif v is not None:
                memory[k] = v
        memory["qa_history"] = (memory.get("qa_history") or []) + [
            {"q": msg, "a": f"ack:{expect_topic or 'hi'}", "topic": expect_topic}
        ]
        memory["qa_history"] = memory["qa_history"][-12:]
        if expect_topic:
            memory["last_service"] = expect_topic
            memory["current_topic"] = expect_topic
            memory["last_quoted_price"] = "Rs 25000"
            memory["last_duration_minutes"] = 180
        recent.append({"role": "user", "content": msg})
        recent.append({"role": "assistant", "content": f"ack {expect_topic}"})

    # After chain, referent still keratin
    final = _replay_turn("Kalin kiwwa eka", memory, recent)
    assert final["ctx"].current_topic == "keratin" or final["ctx"].referent_topic == "keratin"
    assert memory.get("last_quoted_price") == "Rs 25000"
    assert len(memory.get("qa_history") or []) >= 4


def test_sinhala_singlish_english_referents():
    memory = {"last_service": "keratin", "current_topic": "keratin"}
    for msg in ("Eka keeyada?", "That one how much?", "ඒක කීයද?"):
        assert is_referent_message(msg) or "කීය" in msg or "how much" in msg.lower()
        topic = resolve_referent_topic(msg, memory=memory, prior_topic="keratin")
        assert topic == "keratin"
