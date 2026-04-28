import asyncio
import uvicorn
from services.mock_simulator.simulator import main as simulator_main

async def run():
    config  = uvicorn.Config("main:app", host="127.0.0.1", port=8000, reload=False)
    server  = uvicorn.Server(config)
    await asyncio.gather(
        server.serve(),
        simulator_main()
    )

if __name__ == "__main__":
    asyncio.run(run())