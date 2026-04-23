from abc import ABC, abstractmethod
from shared.models import EventoClinico, TipoEvento
from typing import Callable

# ── INTERFACE HANDLER ─────────────────────────────
class IEventHandler(ABC):
    @abstractmethod
    async def manejar(self, evento: EventoClinico) -> None:
        pass

# ── BUS DE EVENTOS ────────────────────────────────
class EventoBus:
    def __init__(self):
        self._handlers: dict[TipoEvento, list[IEventHandler]] = {}

    def suscribir(self, tipo: TipoEvento, handler: IEventHandler) -> None:
        if tipo not in self._handlers:
            self._handlers[tipo] = []
        self._handlers[tipo].append(handler)

    async def publicar(self, evento: EventoClinico) -> None:
        handlers = self._handlers.get(evento.tipo, [])
        for handler in handlers:
            await handler.manejar(evento)

# ── INSTANCIA GLOBAL ──────────────────────────────
bus = EventoBus()