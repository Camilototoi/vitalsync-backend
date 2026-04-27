import httpx
import asyncio
import random
from uuid import uuid4
from shared.models import RegistroClinico, NivelTriage, ResumenClinico
from datetime import datetime

URL_INGESTA = "http://localhost:8000/api/ingesta/registro"
URL_HIS     = "http://localhost:8000/api/ingesta/his"

AMBULANCIAS  = 5
PULSOS_POR_TRAYECTO = random.randint(3, 6)  # 30-60 segundos de trayecto

class Ambulancia:
    def __init__(self, ambulancia_id: int):
        self.id              = ambulancia_id
        self.paciente_uuid   = uuid4()
        self.triage          = random.choice(list(NivelTriage))
        self.pulsos_restantes = random.randint(3, 6)

    def nuevo_paciente(self):
        """Simula que el paciente llegó al hospital y sube uno nuevo."""
        self.paciente_uuid    = uuid4()
        self.triage           = random.choice(list(NivelTriage))
        self.pulsos_restantes = random.randint(3, 6)
        print(f"[Ambulancia {self.id}] 🏥 Paciente entregado — nuevo paciente asignado")

    def generar_registro(self) -> RegistroClinico:
        return RegistroClinico(
            paciente_uuid       = self.paciente_uuid,
            triage              = self.triage,
            frecuencia_cardiaca = random.randint(50, 130),
            presion_arterial    = f"{random.randint(100,150)}/{random.randint(60,95)}",
            imagen_ekg          = None
        )

async def simular_ambulancia(ambulancia: Ambulancia):
    async with httpx.AsyncClient() as client:
        while True:
            try:
                registro = ambulancia.generar_registro()
                response = await client.post(
                    URL_INGESTA,
                    json    = registro.serializar(),
                    timeout = 5.0
                )
                print(
                    f"[Ambulancia {ambulancia.id}] "
                    f"Paciente: {str(ambulancia.paciente_uuid)[:8]}... | "
                    f"Triage: {ambulancia.triage} | "
                    f"FC: {registro.frecuencia_cardiaca} | "
                    f"PA: {registro.presion_arterial} | "
                    f"Pulsos restantes: {ambulancia.pulsos_restantes} | "
                    f"Status: {response.status_code}"
                )

                ambulancia.pulsos_restantes -= 1

                # Trayecto terminado → entregar al hospital y nuevo paciente
                if ambulancia.pulsos_restantes <= 0:
                    ambulancia.nuevo_paciente()

            except Exception as e:
                print(f"[Ambulancia {ambulancia.id}] Error: {e}")

            await asyncio.sleep(10)

async def main():
    print(f"[VitalSync] Iniciando simulación con {AMBULANCIAS} ambulancias...")
    ambulancias = [Ambulancia(i) for i in range(1, AMBULANCIAS + 1)]
    await asyncio.gather(*[
        simular_ambulancia(a) for a in ambulancias
    ])

if __name__ == "__main__":
    asyncio.run(main())