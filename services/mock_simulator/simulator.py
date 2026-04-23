import httpx
import asyncio
import random
from shared.models import RegistroClinico, NivelTriage

URL = "http://localhost:8000/api/ingesta/registro"

AMBULANCIAS = 5  # simula 5 ambulancias en paralelo

def generar_registro() -> RegistroClinico:
    return RegistroClinico(
        triage              = random.choice(list(NivelTriage)),
        frecuencia_cardiaca = random.randint(50, 130),
        presion_arterial    = f"{random.randint(100,150)}/{random.randint(60,95)}",
        imagen_ekg          = None  # opcional, omitir en simulación básica
    )

async def simular_ambulancia(ambulancia_id: int):
    async with httpx.AsyncClient() as client:
        while True:
            try:
                registro = generar_registro()
                response = await client.post(
                    URL,
                    json    = registro.serializar(),
                    timeout = 5.0
                )
                print(
                    f"[Ambulancia {ambulancia_id}] "
                    f"Triage: {registro.triage} | "
                    f"FC: {registro.frecuencia_cardiaca} | "
                    f"PA: {registro.presion_arterial} | "
                    f"Status: {response.status_code}"
                )
            except Exception as e:
                print(f"[Ambulancia {ambulancia_id}] Error: {e}")

            await asyncio.sleep(10)  # pulso cada 10 segundos

async def main():
    print(f"Iniciando simulación con {AMBULANCIAS} ambulancias...")
    await asyncio.gather(*[
        simular_ambulancia(i) for i in range(1, AMBULANCIAS + 1)
    ])

if __name__ == "__main__":
    asyncio.run(main())