import asyncio
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

from services.ingesta.router import router as ingesta_router
from dashboard.router import router as dashboard_router, handler_dashboard
from services.notificacion.sms import handler_sms
from services.his_adapter.rate_limiter import rate_limiter_his
from shared.eventos import bus
from shared.models import TipoEvento

# ── REGISTRO DE HANDLERS EN EL BUS ────────────────
def registrar_handlers():
    bus.suscribir(TipoEvento.VITALES_RECIBIDOS,     handler_dashboard)
    bus.suscribir(TipoEvento.TRIAGE_ROJO_DETECTADO, handler_dashboard)
    bus.suscribir(TipoEvento.TRIAGE_ROJO_DETECTADO, handler_sms)
    bus.suscribir(TipoEvento.HIS_ENCOLADO,          handler_dashboard)

# ── LIFESPAN (startup / shutdown) ─────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    registrar_handlers()
    asyncio.create_task(rate_limiter_his.procesar())
    print("[VitalSync] Sistema iniciado ✅")
    yield
    print("[VitalSync] Sistema detenido")

# ── APP ───────────────────────────────────────────
app = FastAPI(
    title    = "VitalSync API",
    version  = "0.1.0",
    lifespan = lifespan
)

app.include_router(ingesta_router, prefix="/api/ingesta", tags=["Ingesta"])
app.include_router(dashboard_router, prefix="/ws",        tags=["Dashboard"])

@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "ok", "service": "vitalsync"}

@app.get("/paramedico", tags=["Frontend"])
def paramedico():
    return FileResponse("paramedico.html")

app.mount("/", StaticFiles(directory="static", html=True), name="static")