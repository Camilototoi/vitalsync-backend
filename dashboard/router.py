from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from shared.models import EventoClinico, TipoEvento
from shared.eventos import IEventHandler
from shared.bulkhead import bulkhead
from shared.models import TipoServicio

router = APIRouter()

# ── GESTOR DE CLIENTES WEBSOCKET ──────────────────
class HandlerDashboard(IEventHandler):

    def __init__(self):
        self.clientes: list[WebSocket] = []

    async def conectar(self, websocket: WebSocket):
        await websocket.accept()
        self.clientes.append(websocket)
        print(f"[Dashboard] Cliente conectado — total: {len(self.clientes)}")

    def desconectar(self, websocket: WebSocket):
        self.clientes.remove(websocket)
        print(f"[Dashboard] Cliente desconectado — total: {len(self.clientes)}")

    async def manejar(self, evento: EventoClinico) -> None:
        if evento.tipo not in [
            TipoEvento.VITALES_RECIBIDOS,
            TipoEvento.TRIAGE_ROJO_DETECTADO
        ]:
            return
        await bulkhead.ejecutar(
            TipoServicio.DASHBOARD,
            lambda: self.broadcast(evento.payload)
        )

    async def broadcast(self, datos: dict):
        desconectados = []
        for cliente in self.clientes:
            try:
                await cliente.send_json(datos)
            except Exception:
                desconectados.append(cliente)
        for c in desconectados:
            self.clientes.remove(c)

# ── INSTANCIA GLOBAL ──────────────────────────────
handler_dashboard = HandlerDashboard()

# ── ENDPOINT WEBSOCKET ────────────────────────────
@router.websocket("/vitales")
async def websocket_vitales(websocket: WebSocket):
    await handler_dashboard.conectar(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        handler_dashboard.desconectar(websocket)
        