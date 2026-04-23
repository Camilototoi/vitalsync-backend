import asyncio
import httpx
import os
from collections import deque
from datetime import datetime, timedelta
from shared.models import ResumenClinico

class RateLimiterHIS:
    def __init__(self, max_rps: int = 2):
        self.max_rps  = max_rps
        self.cola:    asyncio.Queue = asyncio.Queue()
        self.ventana: deque        = deque()

    async def encolar(self, resumen: ResumenClinico):
        await self.cola.put(resumen)
        print(f"[HIS] Encolado resumen paciente: {resumen.paciente_uuid}")

    async def procesar(self):
        print("[HIS] Rate Limiter iniciado — máx 2 req/s")
        while True:
            ahora = datetime.utcnow()

            # Limpiar ventana de 1 segundo
            self.ventana = deque(
                t for t in self.ventana
                if ahora - t < timedelta(seconds=1)
            )

            if len(self.ventana) < self.max_rps and not self.cola.empty():
                resumen = await self.cola.get()
                self.ventana.append(datetime.utcnow())
                await self._enviar_his(resumen)

            await asyncio.sleep(0.1)

    async def _enviar_his(self, resumen: ResumenClinico):
        url = os.getenv("HIS_URL", "http://localhost:8001/api/his")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json    = resumen.model_dump(mode="json"),
                    timeout = 5.0
                )
                print(f"[HIS] Enviado → Status: {response.status_code}")
        except Exception as e:
            print(f"[HIS] Error al enviar: {e}")

# ── INSTANCIA GLOBAL ──────────────────────────────
rate_limiter_his = RateLimiterHIS()