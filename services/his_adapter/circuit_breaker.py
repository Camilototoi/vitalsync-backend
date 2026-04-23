from shared.bulkhead import CircuitBreaker
from shared.models import TipoServicio
from shared.bulkhead import bulkhead

async def ejecutar_con_proteccion(operacion):
    """
    Ejecuta una operación hacia el HIS
    protegida por el CircuitBreaker del Bulkhead.
    """
    return await bulkhead.ejecutar(TipoServicio.HIS_LEGACY, operacion)

def estado_his() -> str:
    return bulkhead.verificar_estado(TipoServicio.HIS_LEGACY).value