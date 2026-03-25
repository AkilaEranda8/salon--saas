"""
AI Insights Engine — rule-based analysis on salon report data.
No external LLM needed. Generates smart, human-readable insights.
"""
from dataclasses import dataclass


@dataclass
class Insight:
    type: str    # "positive" | "warning" | "negative" | "info"
    icon: str
    title: str
    body: str


def analyze(data: dict) -> list[dict]:
    insights: list[Insight] = []

    revenue_rows  = data.get("revenue", [])
    services_rows = data.get("services", [])
    staff_rows    = data.get("staff", [])
    appt_rows     = data.get("appointments", [])
    expenses_rows = data.get("expenses", [])
    customers_rows = data.get("customers", [])

    # ── 1. Revenue trend ─────────────────────────────────────────────────────
    if len(revenue_rows) >= 2:
        amounts = [float(r.get("revenue") or r.get("dataValues", {}).get("revenue") or 0)
                   for r in revenue_rows]
        last    = amounts[-1]
        prev    = amounts[-2]
        total   = sum(amounts)
        avg     = total / len(amounts)

        if prev > 0:
            change_pct = ((last - prev) / prev) * 100
            if change_pct >= 15:
                insights.append(Insight("positive", "📈", "Revenue Surge",
                    f"This month's revenue is up {change_pct:.1f}% vs last month. "
                    f"Keep up the momentum!"))
            elif change_pct >= 5:
                insights.append(Insight("positive", "📊", "Revenue Growing",
                    f"Revenue grew {change_pct:.1f}% this month. Steady positive trend."))
            elif change_pct <= -15:
                insights.append(Insight("negative", "📉", "Revenue Drop Alert",
                    f"Revenue dropped {abs(change_pct):.1f}% vs last month. "
                    f"Consider running promotions or checking appointment volume."))
            elif change_pct <= -5:
                insights.append(Insight("warning", "⚠️", "Revenue Slightly Down",
                    f"Revenue dipped {abs(change_pct):.1f}% this month. "
                    f"Monitor closely over the next few weeks."))
            else:
                insights.append(Insight("info", "💰", "Revenue Stable",
                    f"Revenue is holding steady. Monthly average: "
                    f"Rs. {avg:,.0f}."))

        # Best month
        if amounts:
            best_idx = amounts.index(max(amounts))
            best_month = revenue_rows[best_idx].get("month") or \
                         revenue_rows[best_idx].get("dataValues", {}).get("month", "")
            insights.append(Insight("info", "🏆", "Best Revenue Month",
                f"Your best month was {best_month} with Rs. {max(amounts):,.0f} in revenue."))

    # ── 2. Services analysis ──────────────────────────────────────────────────
    if services_rows:
        sorted_svc = sorted(services_rows, key=lambda x: float(x.get("revenue", 0)), reverse=True)
        top = sorted_svc[0]
        top_name = top.get("service") or "Unknown"
        top_rev  = float(top.get("revenue", 0))
        top_count = int(top.get("count", 0))

        insights.append(Insight("positive", "✂️", f"Top Service: {top_name}",
            f"Generating Rs. {top_rev:,.0f} from {top_count} bookings this month. "
            f"Consider promoting this service further."))

        if len(sorted_svc) > 1:
            low = sorted_svc[-1]
            low_name  = low.get("service") or "Unknown"
            low_count = int(low.get("count", 0))
            if low_count <= 2 and low_name != top_name:
                insights.append(Insight("warning", "💡", f"Low Demand: {low_name}",
                    f"Only {low_count} bookings this month. "
                    f"Consider a discount or bundle offer to boost demand."))

        total_svc_rev = sum(float(r.get("revenue", 0)) for r in services_rows)
        if total_svc_rev > 0:
            top_share = (top_rev / total_svc_rev) * 100
            if top_share > 60:
                insights.append(Insight("warning", "🎯", "Revenue Concentration Risk",
                    f"{top_name} accounts for {top_share:.0f}% of revenue. "
                    f"Diversifying popular services can reduce risk."))

    # ── 3. Staff performance ──────────────────────────────────────────────────
    if staff_rows:
        sorted_staff = sorted(staff_rows, key=lambda x: float(x.get("revenue", 0)), reverse=True)
        top_staff = sorted_staff[0]
        top_name  = top_staff.get("name", "Staff")
        top_rev   = float(top_staff.get("revenue", 0))
        top_appts = int(top_staff.get("appts", 0))

        insights.append(Insight("positive", "⭐", f"Top Performer: {top_name}",
            f"Delivered Rs. {top_rev:,.0f} from {top_appts} appointments. "
            f"Recognize and reward top performers!"))

        if len(sorted_staff) > 1:
            bottom = sorted_staff[-1]
            b_name  = bottom.get("name", "Staff")
            b_appts = int(bottom.get("appts", 0))
            b_rev   = float(bottom.get("revenue", 0))
            if b_appts < top_appts * 0.4 and b_name != top_name:
                insights.append(Insight("info", "👤", f"Low Activity: {b_name}",
                    f"Only {b_appts} appointments (Rs. {b_rev:,.0f}). "
                    f"Consider additional training or scheduling support."))

    # ── 4. Appointments analysis ──────────────────────────────────────────────
    if appt_rows:
        total_appts   = sum(int(r.get("value", 0)) for r in appt_rows)
        cancelled     = next((int(r.get("value", 0)) for r in appt_rows if r.get("name","").lower() == "cancelled"), 0)
        completed     = next((int(r.get("value", 0)) for r in appt_rows if r.get("name","").lower() == "completed"), 0)

        if total_appts > 0:
            cancel_rate = (cancelled / total_appts) * 100
            complete_rate = (completed / total_appts) * 100

            if cancel_rate >= 20:
                insights.append(Insight("negative", "❌", "High Cancellation Rate",
                    f"{cancel_rate:.0f}% of appointments cancelled this month. "
                    f"Send reminders 24 hours before appointments to reduce no-shows."))
            elif cancel_rate >= 10:
                insights.append(Insight("warning", "⚠️", "Cancellation Rate Warning",
                    f"{cancel_rate:.0f}% cancellation rate. "
                    f"Consider a reminder SMS/email policy."))

            if complete_rate >= 80:
                insights.append(Insight("positive", "✅", "Excellent Completion Rate",
                    f"{complete_rate:.0f}% of appointments completed successfully. "
                    f"Great work keeping customers committed!"))

    # ── 5. Expenses vs Revenue ────────────────────────────────────────────────
    if expenses_rows and revenue_rows:
        total_expenses = sum(float(r.get("amount", 0)) for r in expenses_rows)
        total_revenue  = sum(float(r.get("revenue") or r.get("dataValues", {}).get("revenue") or 0)
                             for r in revenue_rows[-1:])  # last month

        if total_revenue > 0 and total_expenses > 0:
            expense_ratio = (total_expenses / total_revenue) * 100
            if expense_ratio > 80:
                insights.append(Insight("negative", "💸", "High Expense Ratio",
                    f"Expenses are {expense_ratio:.0f}% of revenue. "
                    f"Review and cut non-essential costs to protect profit margin."))
            elif expense_ratio > 50:
                insights.append(Insight("warning", "💳", "Expense Ratio Warning",
                    f"Expenses at {expense_ratio:.0f}% of monthly revenue. "
                    f"Keep an eye on cost trends."))
            else:
                insights.append(Insight("positive", "💚", "Healthy Profit Margin",
                    f"Expenses at {expense_ratio:.0f}% of revenue. "
                    f"Good cost management!"))

    # ── 6. Customer insights ──────────────────────────────────────────────────
    if customers_rows:
        total_customers = len(customers_rows)
        visits_list     = [int(c.get("total_visits", 0)) for c in customers_rows]
        avg_visits      = sum(visits_list) / len(visits_list) if visits_list else 0
        repeat_customers = sum(1 for v in visits_list if v > 1)
        repeat_rate      = (repeat_customers / total_customers * 100) if total_customers else 0

        if repeat_rate >= 60:
            insights.append(Insight("positive", "🤝", "Strong Customer Loyalty",
                f"{repeat_rate:.0f}% of customers are repeat visitors. "
                f"Your loyalty program is working!"))
        elif repeat_rate >= 40:
            insights.append(Insight("info", "👥", "Customer Retention",
                f"{repeat_rate:.0f}% repeat customer rate. "
                f"Average {avg_visits:.1f} visits per customer."))
        else:
            insights.append(Insight("warning", "🔔", "Low Customer Retention",
                f"Only {repeat_rate:.0f}% repeat customers. "
                f"Consider loyalty rewards or follow-up messages to bring customers back."))

    # ── 7. General tips if data is sparse ────────────────────────────────────
    if not insights:
        insights.append(Insight("info", "📊", "No Data Yet",
            "Add more appointments, payments, and customer records to unlock AI insights."))

    return [
        {
            "type":  ins.type,
            "icon":  ins.icon,
            "title": ins.title,
            "body":  ins.body,
        }
        for ins in insights
    ]
