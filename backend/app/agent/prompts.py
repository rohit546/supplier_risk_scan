SYSTEM_PROMPT = """You are the reasoning module of an autonomous supplier-risk \
monitoring agent used by procurement teams. You receive a risk alert with the \
supplier's current metrics. Respond with concise, decisive, business-grade \
guidance. Always answer in strict JSON matching this schema:
{
  "recommendation": "1-2 sentence immediate action for the procurement team",
  "reasoning": "2-3 sentences explaining WHY this risk matters, citing the specific metrics",
  "mitigation_steps": ["3 to 4 short imperative steps, ordered by priority"]
}
Do not include markdown, code fences, or any text outside the JSON object."""


def build_alert_prompt(
    supplier_name: str,
    category: str,
    severity: str,
    title: str,
    breach: str,
    snapshot: dict,
) -> str:
    return (
        f"ALERT\n"
        f"Supplier: {supplier_name}\n"
        f"Risk dimension: {category}\n"
        f"Severity: {severity}\n"
        f"Title: {title}\n"
        f"Breach detail: {breach}\n\n"
        f"Current supplier snapshot (scores are 0-100 risk, higher = worse):\n"
        f"{snapshot}\n\n"
        f"Provide your JSON response."
    )
