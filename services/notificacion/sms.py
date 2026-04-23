import httpx
import os
from shared.models import EventoClinico, TipoEvento, NivelTriage
from shared.eventos import IEventHandler
from shared.bulkhead import bulkhead
from shared.models import TipoServicio

class HandlerNotificacionSMS(IEventHandler):

    async def manejar(self, evento: EventoClinico) -> None:
        if evento.tipo != TipoEvento.TRIAGE_ROJO_DETECTADO:
            return
        paciente_uuid = evento.payload.get("paciente_uuid", "desconocido")
        await bulkhead.ejecutar(
            TipoServicio.SMS_GATEWAY,
            lambda: self._enviar_sms(paciente_uuid)
        )

    async def _enviar_sms(self, paciente_uuid: str):
        url     = os.getenv("SMS_GATEWAY_URL", "https://api.smsgateway.com")
        api_key = os.getenv("SMS_API_KEY", "")
        mensaje = (
            f"ALERTA TRIAGE ROJO — "
            f"Paciente UUID: {paciente_uuid}. "
            f"Prepare quirófano inmediatamente."
        )
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers = {"Authorization": f"Bearer {api_key}"},
                    json    = {"mensaje": mensaje},
                    timeout = 5.0
                )
                print(f"[SMS] Alerta enviada → Status: {response.status_code}")
        except Exception as e:
            print(f"[SMS] Error al enviar alerta: {e}")

# ── INSTANCIA GLOBAL ──────────────────────────────
handler_sms = HandlerNotificacionSMS()