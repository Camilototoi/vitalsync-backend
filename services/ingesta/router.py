from fastapi import APIRouter, HTTPException
from shared.models import RegistroClinico
from services.ingesta.service import ingesta_service

router = APIRouter()

@router.post("/registro", status_code=201)
async def recibir_registro(registro: RegistroClinico):
    try:
        resultado = await ingesta_service.procesar(registro)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
def health_ingesta():
    return {"servicio": "ingesta", "status": "ok"}