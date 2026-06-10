from fastapi import APIRouter, Request

from app.schemas import AckRequest, Alert

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
