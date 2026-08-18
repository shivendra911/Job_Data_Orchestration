"""
Chaos Sandbox Server.
Simulates a flaky remote API for testing resilience patterns.
"""
import asyncio
import random
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title="Chaos Sandbox API")

# Internal state to track sequential requests for specific failure modes
request_counts = {
    "remotive": 0,
}

@app.get("/api/remote-jobs")
async def mock_remotive():
    """
    Simulates Remotive API with chaos:
    - 20% chance of 502 Bad Gateway
    - 20% chance of 429 Too Many Requests
    - 10% chance of slow response (3 seconds)
    - 50% chance of success
    """
    request_counts["remotive"] += 1
    count = request_counts["remotive"]
    
    # Deterministic failure on first 2 requests to test Retries
    if count <= 2:
        raise HTTPException(status_code=502, detail="Chaos: Simulated Bad Gateway")
        
    roll = random.random()
    
    if roll < 0.2:
        raise HTTPException(status_code=502, detail="Chaos: Random Bad Gateway")
    elif roll < 0.4:
        raise HTTPException(status_code=429, detail="Chaos: Rate Limited")
    elif roll < 0.5:
        await asyncio.sleep(3)
        
    return JSONResponse(content={
        "jobs": [
            {
                "id": f"sandbox-{count}-1",
                "title": "Chaos Engineer",
                "company_name": "Sandbox Corp",
                "url": "http://sandbox/1",
            }
        ]
    })
