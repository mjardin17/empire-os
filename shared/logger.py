import json
import logging
import sys
from datetime import datetime
from typing import Any, Dict, Optional

class EmpireLogger:
    def __init__(self, name: str = "EmpireOS"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            formatter = logging.Formatter('%(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def log(self, level: str, message: str, factory: str = "SYSTEM", data: Optional[Dict[str, Any]] = None):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level.upper(),
            "factory": factory,
            "message": message,
            "data": data or {}
        }
        formatted = json.dumps(log_entry)
        if level.lower() == "error":
            self.logger.error(formatted)
        elif level.lower() == "warning":
            self.logger.warning(formatted)
        else:
            self.logger.info(formatted)

    def info(self, message: str, factory: str = "SYSTEM", data: Optional[Dict[str, Any]] = None):
        self.log("INFO", message, factory, data)

    def warning(self, message: str, factory: str = "SYSTEM", data: Optional[Dict[str, Any]] = None):
        self.log("WARNING", message, factory, data)

    def error(self, message: str, factory: str = "SYSTEM", data: Optional[Dict[str, Any]] = None):
        self.log("ERROR", message, factory, data)

logger = EmpireLogger()
