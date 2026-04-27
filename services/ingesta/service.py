from shared.models import RegistroClinico, EventoClinico, TipoEvento, EstadoRegistro, ResumenClinico
from shared.anonimizacion import anonimizador
from shared.eventos import bus
from shared.bulkhead import bulkhead
from shared.models import TipoServicio, NivelTriage
from services.his_adapter.rate_limiter import rate_limiter_his

class IngestaService:

    async def procesar(self, registro: RegistroClinico) -> dict:

        # 1. Anonimizar PII
        datos_raw = registro.serializar()
        datos_clinicos, datos_pii = anonimizador.separar_pii(datos_raw)

        # 2. Marcar como en cola
        registro.estado = EstadoRegistro.EN_COLA

        # 3. Publicar evento al bus → dashboard
        evento = EventoClinico(
            tipo    = TipoEvento.VITALES_RECIBIDOS,
            payload = datos_clinicos,
            origen  = "ingesta"
        )
        await bulkhead.ejecutar(
            TipoServicio.INGESTA,
            lambda: bus.publicar(evento)
        )

        # 4. Si Triage Rojo → publicar evento adicional → SMS
        if registro.triage == NivelTriage.ROJO:
            evento_rojo = EventoClinico(
                tipo    = TipoEvento.TRIAGE_ROJO_DETECTADO,
                payload = datos_clinicos,
                origen  = "ingesta"
            )
            await bus.publicar(evento_rojo)

        # 5. Encolar resumen clínico al HIS con rate limiting
        resumen = ResumenClinico(
            paciente_uuid          = registro.paciente_uuid,
            diagnostico_preliminar = f"Triage {registro.triage} — monitoreo prehospitalario activo",
            signos_vitales         = {
                "frecuencia_cardiaca": registro.frecuencia_cardiaca,
                "presion_arterial":    registro.presion_arterial
            },
            nivel_triage           = registro.triage
        )
        await rate_limiter_his.encolar(resumen)

        registro.estado = EstadoRegistro.SINCRONIZADO
        return {"id": str(registro.id), "estado": registro.estado}

# ── INSTANCIA GLOBAL ──────────────────────────────
ingesta_service = IngestaService()