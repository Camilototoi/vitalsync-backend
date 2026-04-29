import asyncio
import uvicorn
from services.mock_simulator.simulator import main as simulator_main

async def run():
    backend = uvicorn.Server(uvicorn.Config("main:app", host="127.0.0.1", port=8000, reload=False))
    his     = uvicorn.Server(uvicorn.Config("services.his_adapter.mock_his_server:app", host="127.0.0.1", port=8001, reload=False))

    await asyncio.gather(
        backend.serve(),
        his.serve(),
        simulator_main()
    )

if __name__ == "__main__":
    asyncio.run(run())