from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["stream"])


@router.websocket("/ws/feed")
async def feed_socket(ws: WebSocket) -> None:
    broadcaster = ws.app.state.broadcaster
    store = ws.app.state.store
    await broadcaster.connect(ws)
    # Send the recent backlog so a fresh client has immediate context.
    async with store.lock:
        backlog = [e.model_dump() for e in list(store.feed)]
    await ws.send_json({"type": "backlog", "payload": backlog})
    try:
        while True:
            # Keep the connection alive; inbound messages are ignored.
            await ws.receive_text()
    except WebSocketDisconnect:
        await broadcaster.disconnect(ws)
    except Exception:
        await broadcaster.disconnect(ws)
