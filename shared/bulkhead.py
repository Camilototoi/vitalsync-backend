import asyncio
from datetime import datetime, timedelta
from shared.models import TipoServicio, EstadoCircuito

# ── CIRCUIT BREAKER ───────────────────────────────
class CircuitBreaker:
    def __init__(self, umbral_fallos: int = 3, timeout_seg: int = 5):
        self.estado          = EstadoCircuito.CERRADO
        self.contador_fallos = 0
        self.umbral_fallos   = umbral_fallos
        self.timeout_seg     = timeout_seg
        self._ultimo_fallo:  datetime | None = None

    async def ejecutar(self, operacion):
        if self.estado == EstadoCircuito.ABIERTO:
            if self._puede_intentar():
                self.estado = EstadoCircuito.SEMI_ABIERTO
            else:
                raise Exception("CircuitBreaker ABIERTO — servicio no disponible")
        try:
            resultado = await operacion()
            self.registrar_exito()
            return resultado
        except Exception as e:
            self.registrar_fallo()
            raise e

    def registrar_fallo(self):
        self.contador_fallos += 1
        self._ultimo_fallo = datetime.utcnow()
        if self.contador_fallos >= self.umbral_fallos:
            self.estado = EstadoCircuito.ABIERTO

    def registrar_exito(self):
        self.contador_fallos = 0
        self.estado          = EstadoCircuito.CERRADO

    def _puede_intentar(self) -> bool:
        if self._ultimo_fallo is None:
            return True
        return datetime.utcnow() - self._ultimo_fallo > timedelta(seconds=self.timeout_seg)

    def esta_abierto(self) -> bool:
        return self.estado == EstadoCircuito.ABIERTO


# ── BULKHEAD ──────────────────────────────────────
class BulkheadAislador:
    def __init__(self):
        self._circuit_breakers: dict[TipoServicio, CircuitBreaker] = {
            TipoServicio.DASHBOARD:   CircuitBreaker(),
            TipoServicio.HIS_LEGACY:  CircuitBreaker(),
            TipoServicio.SMS_GATEWAY: CircuitBreaker(),
            TipoServicio.INGESTA:     CircuitBreaker(),
        }

    async def ejecutar(self, servicio: TipoServicio, operacion):
        cb = self._circuit_breakers[servicio]
        return await cb.ejecutar(operacion)

    def verificar_estado(self, servicio: TipoServicio) -> EstadoCircuito:
        return self._circuit_breakers[servicio].estado

    def aislar_fallo(self, servicio: TipoServicio):
        self._circuit_breakers[servicio].registrar_fallo()

# ── INSTANCIA GLOBAL ──────────────────────────────
bulkhead = BulkheadAislador()