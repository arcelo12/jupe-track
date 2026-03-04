from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import bgp, looking_glass, settings, interfaces

app = FastAPI(title="Juniper MX204 Monitoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bgp.router, prefix="/api/v1")
app.include_router(looking_glass.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1/settings")
app.include_router(interfaces.router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Juniper MX204 Monitoring API is running"}
