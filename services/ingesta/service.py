from shared.models import RegistroClinico, EventoClinico, TipoEvento, EstadoRegistro
from shared.anonimizacion import anonimizador
from shared.eventos import bus
from shared.bulkhead import bulkhead
from shared.models import TipoServicio

class IngestaService:

    async def procesar(self, registro: RegistroClinico) -> dict:

        # 1. Anonimizar PII
        datos_raw = registro.serializar()
        datos_clinicos, datos_pii = anonimizador.separar_pii(datos_raw)

        # 2. Marcar como en cola
        registro.estado = EstadoRegistro.EN_COLA

        # 3. Publicar evento al bus
        evento = EventoClinico(
            tipo    = TipoEvento.VITALES_RECIBIDOS,
            payload = datos_clinicos,
            origen  = "ingesta"
        )
        await bulkhead.ejecutar(
            TipoServicio.INGESTA,
            lambda: bus.publicar(evento)
        )

        # 4. Si Triage Rojo → publicar evento adicional
        from shared.models import NivelTriage
        if registro.triage == NivelTriage.ROJO:
            evento_rojo = EventoClinico(
                tipo    = TipoEvento.TRIAGE_ROJO_DETECTADO,
                payload = datos_clinicos,
                origen  = "ingesta"
            )
            await bus.publicar(evento_rojo)

        registro.estado = EstadoRegistro.SINCRONIZADO
        return {"id": str(registro.id), "estado": registro.estado}

# ── INSTANCIA GLOBAL ──────────────────────────────
ingesta_service = IngestaService()