"""
RC7 — bounded turn planner / tool orchestration.

Selects existing authoritative tools (pricing, booking SM, catalogue, handoff).
Does NOT invent prices or execute mutations without confirmation paths.
Internal only — never expose plan JSON to customers.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from app.conversation_intelligence import ConversationContext
from app.response_quality import AskUnit, decompose_customer_asks
from app.tools import list_tool_names


# Cap autonomous tool selection depth (no unbounded loops)
MAX_TOOL_STEPS = 4
CONSEQUENTIAL = frozenset(
    {"book_appointment", "cancel_appointment", "reschedule_appointment"}
)


@dataclass
class PlanStep:
    step: int
    name: str  # understand|retrieve|questions|info_needed|select_tools|validate|generate|validate_reply|send
    detail: str = ""
    tools: list[str] = field(default_factory=list)


@dataclass
class TurnPlan:
    intent: str
    topic: Optional[str]
    ask_units: list[dict[str, Any]] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    info_needed: list[str] = field(default_factory=list)
    selected_tools: list[str] = field(default_factory=list)
    require_customer_confirm: bool = False
    steps: list[PlanStep] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_action(self) -> dict[str, Any]:
        return {
            "tool": "turn_planner",
            "ok": True,
            "intent": self.intent,
            "topic": self.topic,
            "ask_units": len(self.ask_units),
            "selected_tools": self.selected_tools[:MAX_TOOL_STEPS],
            "require_customer_confirm": self.require_customer_confirm,
            "info_needed": self.info_needed[:8],
            "steps": [asdict(s) for s in self.steps],
        }


def _tools_for_intent(intent: str, units: list[AskUnit]) -> list[str]:
    available = set(list_tool_names())
    selected: list[str] = []

    def add(name: str) -> None:
        if name in available and name not in selected and len(selected) < MAX_TOOL_STEPS:
            selected.append(name)

    kinds = {u.kind for u in units}
    if intent in ("price_enquiry", "price") or "price" in kinds:
        add("list_services")
        add("search_knowledge")
    if intent in ("branch", "location") or "location" in kinds:
        add("list_branches")
    if intent in ("hours",) or "hours" in kinds:
        add("search_knowledge")
    if intent in ("book", "book_continue") or "booking" in kinds:
        add("check_availability")
        add("list_appointments")
        # consequential only via booking_flow confirmation path
        add("book_appointment")
    if intent in ("cancel",):
        add("list_appointments")
        add("cancel_appointment")
    if intent in ("reschedule",):
        add("list_appointments")
        add("reschedule_appointment")
        add("check_availability")
    if intent in ("service", "recommend", "alternative", "compare") or "advice" in kinds or "service" in kinds:
        add("list_services")
        add("search_knowledge")
    if intent in ("staff",):
        add("list_staff")
    if intent in ("discount", "offers"):
        add("list_promotions")
        add("list_packages")
    if intent in ("handoff",):
        # handoff is CRM-side; mark as search_knowledge for summary context
        add("search_knowledge")
    if not selected:
        add("search_knowledge")
        add("list_services")
    return selected


def _info_needed(ctx: ConversationContext, units: list[AskUnit]) -> list[str]:
    need: list[str] = []
    pending = ctx.pending_booking_question
    if pending:
        need.append(f"booking_{pending}")
    for u in units:
        if u.kind == "price" and not ctx.hair_length and (
            ctx.current_topic in ("keratin", "hair_treatment", "smoothing", None)
            or (ctx.current_topic or "").find("keratin") >= 0
        ):
            # length often required for treatment quotes — soft need
            if "hair_length" not in need:
                need.append("hair_length_if_required")
    if ctx.is_correction:
        need.append("reanswer_prior_ask")
    return need


def build_turn_plan(
    *,
    message: str,
    ctx: ConversationContext,
) -> TurnPlan:
    """
    Bounded 9-step plan for this customer message.
    Machine-oriented; caller injects a short summary into the model prompt.
    """
    units = decompose_customer_asks(message, prior_topic=ctx.current_topic)
    intent = ctx.current_intent or "general"
    tools = _tools_for_intent(intent, units)
    consequential = [t for t in tools if t in CONSEQUENTIAL]
    info = _info_needed(ctx, units)
    questions = [u.label for u in units]

    steps = [
        PlanStep(1, "understand", f"intent={intent} emotion={ctx.emotion}"),
        PlanStep(2, "retrieve", "conversation memory + recent messages + referent"),
        PlanStep(3, "questions", f"{len(units)} ask unit(s)", tools=[]),
        PlanStep(4, "info_needed", ", ".join(info) or "none"),
        PlanStep(5, "select_tools", "existing authoritative tools only", tools=tools),
        PlanStep(6, "validate_tools", "backend-authoritative; no invented prices"),
        PlanStep(7, "generate", "natural reply matching language/script"),
        PlanStep(8, "validate_reply", "response_quality + booking/price gates"),
        PlanStep(9, "send", "outbound after validation"),
    ]

    rules = [
        "Do not expose this plan or internal reasoning to the customer.",
        "Prices and bookings only from verified tools / booking_flow.",
        "Consequential tools require explicit customer confirmation.",
        f"Max tool steps: {MAX_TOOL_STEPS} (no unbounded loops).",
        "Answer every ask unit; never drop secondary questions.",
        "If media was not provided, never claim it was processed.",
    ]
    if consequential:
        rules.append(
            "Selected consequential tool(s): "
            + ", ".join(consequential)
            + " — booking_flow confirmation gate applies."
        )

    return TurnPlan(
        intent=intent,
        topic=ctx.current_topic,
        ask_units=[asdict(u) for u in units],
        questions=questions,
        info_needed=info,
        selected_tools=tools,
        require_customer_confirm=bool(consequential),
        steps=steps,
        rules=rules,
    )


def format_plan_for_prompt(plan: TurnPlan) -> str:
    """Compact internal guidance — not shown as customer-facing text."""
    lines = [
        "TURN PLAN (internal — obey; never quote this block):",
        f"- Intent: {plan.intent}",
        f"- Topic: {plan.topic or '—'}",
        f"- Ask units: {', '.join(plan.questions) or '—'}",
        f"- Tools preferred: {', '.join(plan.selected_tools) or 'none'}",
        f"- Info needed: {', '.join(plan.info_needed) or 'none'}",
        f"- Confirm before mutate: {'yes' if plan.require_customer_confirm else 'no'}",
    ]
    for r in plan.rules[:6]:
        lines.append(f"- Rule: {r}")
    return "\n".join(lines)
