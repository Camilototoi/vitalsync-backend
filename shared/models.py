from pydantic import BaseModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum
from typing import Optional

# ── ENUMS ─────────────────────────────────────────
class NivelTriage(str, Enum):
    ROJO     = "ROJO"
    AMARILLO = "AMARILLO"
    VERDE    = "VERDE"

class EstadoRegistro(str, Enum):
    PENDIENTE_SYNC = "PENDIENTE_SYNC"
    EN_COLA        = "EN_COLA"
    SINCRONIZADO   = "SINCRONIZADO"
    FALLIDO        = "FALLIDO"

class TipoEvento(str, Enum):
    VITALES_RECIBIDOS      = "VITALES_RECIBIDOS"
    TRIAGE_ROJO_DETECTADO  = "TRIAGE_ROJO_DETECTADO"
    SYNC_COMPLETADA        = "SYNC_COMPLETADA"
    HIS_ENCOLADO           = "HIS_ENCOLADO"

class TipoServicio(str, Enum):
    DASHBOARD = "DASHBOARD"
    HIS_LEGACY = "HIS_LEGACY"
    SMS_GATEWAY = "SMS_GATEWAY"
    INGESTA = "INGESTA"

class EstadoCircuito(str, Enum):
    CERRADO     = "CERRADO"
    ABIERTO     = "ABIERTO"
    SEMI_ABIERTO = "SEMI_ABIERTO"

class EstadoRed(str, Enum):
    ONLINE   = "ONLINE"
    OFFLINE  = "OFFLINE"
    DEGRADADA = "DEGRADADA"

# ── MODELOS PRINCIPALES ───────────────────────────
class RegistroClinico(BaseModel):
    id:                  UUID     = Field(default_factory=uuid4)
    ambulancia_id:       int      = 0
    paciente_uuid:       UUID     = Field(default_factory=uuid4)
    timestamp:           datetime = Field(default_factory=datetime.utcnow)
    triage:              NivelTriage
    frecuencia_cardiaca: int
    presion_arterial:    str
    imagen_ekg:          Optional[str] = None
    estado:              EstadoRegistro = EstadoRegistro.PENDIENTE_SYNC
    cifrado_local:       bool = False

    def serializar(self) -> dict:
        return self.model_dump(mode="json")

class EventoClinico(BaseModel):
    id:        UUID     = Field(default_factory=uuid4)
    tipo:      TipoEvento
    payload:   dict
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    origen:    str

class ResumenClinico(BaseModel):
    paciente_uuid:          UUID
    diagnostico_preliminar: str
    signos_vitales:         dict
    nivel_triage:           NivelTriage
    timestamp_llegada:      datetime = Field(default_factory=datetime.utcnow)