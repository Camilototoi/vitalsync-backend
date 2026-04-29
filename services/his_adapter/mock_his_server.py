from fastapi import FastAPI, Request, Response
import time
import uvicorn

app = FastAPI(title="HIS Mock Server")

# Control de rate limiting — máx 2 req/s
historial = []

@app.post("/api/his")
async def recibir_resumen(request: Request):
    global historial
    ahora = time.time()

    # Limpiar peticiones fuera de la ventana de 1 segundo
    historial = [t for t in historial if ahora - t < 1.0]

    if len(historial) >= 2:
        print(f"[HIS Mock] ⚠ Límite excedido — 429 Too Many Requests")
        return Response(
            content='{"error": "Too Many Requests"}',
            status_code=429,
            media_type="application/json"
        )

    historial.append(ahora)
    body = await request.json()
    paciente = body.get("paciente_uuid", "desconocido")[:8]
    triage   = body.get("nivel_triage", "—")
    print(f"[HIS Mock] ✅ Resumen recibido — Paciente: {paciente}... | Triage: {triage}")

    return Response(
        content='{"status": "ok", "message": "Resumen clínico registrado"}',
        status_code=200,
        media_type="application/json"
    )

@app.get("/health")
def health():
    return {"status": "ok", "service": "HIS Mock Server"}

if __name__ == "__main__":
    uvicorn.run("services.his_adapter.mock_his_server:app", host="127.0.0.1", port=8001, reload=False)