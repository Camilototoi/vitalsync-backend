from uuid import UUID, uuid4
from shared.models import RegistroClinico

# Mapeo en memoria: dato_real → UUID anónimo
_mapeo: dict[str, UUID] = {}

class ServicioAnonimizacion:

    def anonimizar(self, datos: dict) -> dict:
        """
        Elimina PII del registro y reemplaza por UUID anónimo.
        Retorna datos médicos limpios.
        """
        datos_limpios = datos.copy()
        campos_pii = ["nombre", "documento", "telefono", "direccion"]
        for campo in campos_pii:
            if campo in datos_limpios:
                del datos_limpios[campo]
        return datos_limpios

    def separar_pii(self, datos: dict) -> tuple[dict, dict]:
        """
        Separa datos médicos de PII.
        Retorna (datos_clinicos, datos_pii)
        """
        campos_pii = ["nombre", "documento", "telefono", "direccion"]
        pii = {k: datos[k] for k in campos_pii if k in datos}
        clinicos = {k: v for k, v in datos.items() if k not in campos_pii}
        return clinicos, pii

    def generar_uuid_anonimo(self, identificador: str) -> UUID:
        """
        Genera o recupera UUID anónimo para un identificador real.
        El identificador real NUNCA sale de esta función.
        """
        if identificador not in _mapeo:
            _mapeo[identificador] = uuid4()
        return _mapeo[identificador]

# ── INSTANCIA GLOBAL ──────────────────────────────
anonimizador = ServicioAnonimizacion()