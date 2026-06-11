from fastapi import APIRouter, HTTPException, Request

from app.core.store import now_iso
from app.schemas import (
    AckRequest,
    Alert,
    AgentEvent,
    AssessmentMeta,
    AssessmentResult,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
async def list_alerts(request: Request) -> list[Alert]:
    store = request.app.state.store
    async with store.lock:
        return list(store.alerts)


@router.post("/ack", response_model=list[Alert])
async def acknowledge(body: AckRequest, request: Request) -> list[Alert]:
    """Acknowledge one or many alerts (bulk action) and return the new list."""
    store = request.app.state.store
    async with store.lock:
        store.acknowledge(body.ids)
        return list(store.alerts)


@router.post("/{alert_id}/assess", response_model=AssessmentResult)
async def assess(alert_id: str, request: Request) -> AssessmentResult:
    """Run an LLM assessment for a single alert on demand (operator-triggered).

    Returns the updated alert plus a diagnostic trace (provider, model,
    latency, exact prompt sent, raw response) so the call is verifiable.
    """
    store = request.app.state.store
    llm = request.app.state.llm
    broadcaster = request.app.state.broadcaster

    async with store.lock:
        alert = store.get_alert(alert_id)
        if alert is None:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        snapshot = store.alert_snapshots.get(alert_id, {})
        category, severity, title, breach = (
            alert.category, alert.severity, alert.title, alert.breach,
        )
        supplier_name = alert.supplierName

    result, meta = await llm.assess_alert_verbose(
        supplier_name, category, severity, title, breach, snapshot
    )

    async with store.lock:
        alert = store.get_alert(alert_id)
        if alert is None:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        alert.recommendation = result["recommendation"]
        alert.reasoning = result["reasoning"]
        alert.mitigationSteps = result["mitigation_steps"]
        alert.source = result["source"]
        alert.assessedAt = now_iso()
        updated = alert.model_copy(deep=True)

    await broadcaster.broadcast({"type": "alert", "payload": updated.model_dump()})

    # Surface the assessment on the live agent feed.
    async with store.lock:
        event = AgentEvent(
            id=store.next_id("evt"),
            ts=now_iso(),
            supplierName=supplier_name,
            action="Operator ran AI assessment",
            detail=(
                f"{meta['provider']}/{meta['model']} → {result['source'].upper()} "
                f"in {meta['latencyMs']}ms"
                + (f" (fallback: {meta['error']})" if meta.get("error") else "")
            ),
            kind="mitigation",
        )
        store.add_event(event)
    await broadcaster.broadcast({"type": "event", "payload": event.model_dump()})

    return AssessmentResult(alert=updated, meta=AssessmentMeta(**meta))
