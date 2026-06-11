from fastapi import APIRouter, Request

from app.config import get_settings
from app.schemas import AgentEvent, Health, Portfolio

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.get("/portfolio", response_model=Portfolio)
async def portfolio(request: Request) -> Portfolio:
    store = request.app.state.store
    llm = request.app.state.llm
    settings = get_settings()
    async with store.lock:
        return store.portfolio(llm.provider, llm.active, settings.llm_mode)


@router.get("/feed", response_model=list[AgentEvent])
async def feed(request: Request) -> list[AgentEvent]:
    store = request.app.state.store
    async with store.lock:
        return list(store.feed)


@router.get("/health", response_model=Health)
async def health(request: Request) -> Health:
    store = request.app.state.store
    llm = request.app.state.llm
    async with store.lock:
        return Health(
            status="ok",
            llmProvider=llm.provider,
            llmActive=llm.active,
            suppliers=len(store.suppliers),
        )
