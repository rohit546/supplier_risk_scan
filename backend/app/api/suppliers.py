from fastapi import APIRouter, HTTPException, Request

from app.core.store import now_iso
from app.schemas import AgentEvent, NewSupplierRequest, Supplier, SupplierDetail

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[Supplier])
async def list_suppliers(request: Request) -> list[Supplier]:
    store = request.app.state.store
    async with store.lock:
        return [store.to_supplier(st) for st in store.suppliers.values()]


@router.post("", response_model=SupplierDetail, status_code=201)
async def create_supplier(req: NewSupplierRequest, request: Request) -> SupplierDetail:
    store = request.app.state.store
    broadcaster = request.app.state.broadcaster
    async with store.lock:
        st = store.add_supplier(req)
        detail = store.to_supplier_detail(st)
        event = AgentEvent(
            id=store.next_id("evt"),
            ts=now_iso(),
            supplierName=st.name,
            action="Supplier onboarded",
            detail=(
                f"Manual onboarding into watchlist · initial risk index "
                f"{st.overall}/100 · monitoring active across 5 dimensions."
            ),
            kind="update",
        )
        store.add_event(event)
    await broadcaster.broadcast({"type": "event", "payload": event.model_dump()})
    return detail


@router.get("/{supplier_id}", response_model=SupplierDetail)
async def get_supplier(supplier_id: str, request: Request) -> SupplierDetail:
    store = request.app.state.store
    async with store.lock:
        st = store.suppliers.get(supplier_id)
        if st is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return store.to_supplier_detail(st)
