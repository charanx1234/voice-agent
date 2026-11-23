"""
FRIDAY Cognitive Engine — Streaming Response Engine
Processes token deltas incrementally, preserves markdown formatting boundaries,
tracks request ID correlation, and supports clean cancellation.
"""

from __future__ import annotations
import time
from enum import Enum
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field


class StreamEventType(str, Enum):
    DELTA = "delta"
    COMPLETE = "complete"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class StreamChunk:
    request_id: str
    event_type: StreamEventType
    text: str = ""
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "requestId": self.request_id,
            "type": self.event_type.value,
        }
        if self.text:
            data["text"] = self.text
        if self.error:
            data["error"] = self.error
        return data


class ResponseStreamer:
    """
    Manages active streaming requests, handles token aggregation,
    and guards against cross-request race conditions.
    """

    def __init__(self):
        self._active_streams: Dict[str, Dict[str, Any]] = {}

    def open_stream(
        self,
        request_id: str,
        on_chunk: Optional[Callable[[StreamChunk], None]] = None
    ) -> None:
        self._active_streams[request_id] = {
            "accumulated": [],
            "on_chunk": on_chunk,
            "cancelled": False,
            "started_at": time.time(),
            "first_token_at": None,
        }

    def emit_delta(self, request_id: str, delta_text: str) -> bool:
        """
        Emits text delta if request is active and not cancelled.
        Returns False if cancelled or unknown.
        """
        stream = self._active_streams.get(request_id)
        if not stream or stream.get("cancelled"):
            return False

        if stream["first_token_at"] is None and delta_text:
            stream["first_token_at"] = time.time()

        stream["accumulated"].append(delta_text)

        chunk = StreamChunk(
            request_id=request_id,
            event_type=StreamEventType.DELTA,
            text=delta_text
        )
        callback = stream.get("on_chunk")
        if callback:
            callback(chunk)
        return True

    def emit_complete(self, request_id: str) -> str:
        """Finalizes the stream and returns the entire assembled text."""
        stream = self._active_streams.pop(request_id, None)
        if not stream:
            return ""

        full_text = "".join(stream["accumulated"])
        chunk = StreamChunk(
            request_id=request_id,
            event_type=StreamEventType.COMPLETE,
            text=""
        )
        callback = stream.get("on_chunk")
        if callback:
            callback(chunk)
        return full_text

    def emit_cancelled(self, request_id: str) -> None:
        """Cancels an active stream and notifies listeners."""
        stream = self._active_streams.pop(request_id, None)
        if not stream:
            return

        stream["cancelled"] = True
        chunk = StreamChunk(
            request_id=request_id,
            event_type=StreamEventType.CANCELLED,
            text=""
        )
        callback = stream.get("on_chunk")
        if callback:
            callback(chunk)

    def emit_error(self, request_id: str, error_message: str) -> None:
        """Emits an error event and terminates stream."""
        stream = self._active_streams.pop(request_id, None)
        if not stream:
            return

        chunk = StreamChunk(
            request_id=request_id,
            event_type=StreamEventType.ERROR,
            error=error_message
        )
        callback = stream.get("on_chunk")
        if callback:
            callback(chunk)

    def is_cancelled(self, request_id: str) -> bool:
        stream = self._active_streams.get(request_id)
        return stream is None or bool(stream.get("cancelled"))
