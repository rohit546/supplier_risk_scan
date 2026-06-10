import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.llm import LLMClient
from app.agent.monitor import MonitorAgent
from app.api import alerts, portfolio, stream, suppliers
from app.config import get_settings
from app.core.broadcast import Broadcaster
from app.core.store import Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("riskscan")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    store = Store(settings)
    llm = LLMClient(settings)
    broadcaster = Broadcaster()
    agent = MonitorAgent(store, llm, broadcaster, settings)

    app.state.store = store
    app.state.llm = llm
    app.state.broadcaster = broadcaster

    async def boot() -> None:
        store.seed()
        log.info("Seeded %d suppliers from fixtures", len(store.suppliers))
        log.info(
            "LLM provider=%s active=%s (fallback reasoning %s)",
            llm.provider, llm.active, "disabled" if llm.active else "enabled",
        )
        await agent.run()

    task = asyncio.create_task(boot(), name="monitor-agent")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="SCMDOJO RiskScan API",
    description="Autonomous supplier risk monitoring agent — scoring engine, alerting, live feed.",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(suppliers.router)
app.include_router(alerts.router)
app.include_router(stream.router)
