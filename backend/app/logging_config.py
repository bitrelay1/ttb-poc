import json
import logging
from datetime import datetime, timezone


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(entry)


def configure_logging() -> None:
    """
    Switch all loggers to structured JSON output on stdout.

    In production, a log-shipper sidecar (Fluent Bit, Vector, or the Azure Monitor
    agent) reads these JSON lines from the container's stdout and forwards them to
    the SIEM (e.g., Azure Log Analytics / Sentinel) — no syslog socket needed in
    the app itself.  To forward to a traditional syslog target instead, replace the
    StreamHandler below with a SysLogHandler pointed at the local socket or a
    remote UDP/TCP endpoint.
    """
    formatter = _JsonFormatter()
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # Prevent uvicorn from adding its own handlers after we configure; let logs
    # propagate to root so they pick up the JSON formatter.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        log = logging.getLogger(name)
        log.handlers = []
        log.propagate = True
