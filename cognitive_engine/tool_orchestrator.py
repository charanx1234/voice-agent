"""
FRIDAY Cognitive Engine — Tool Orchestrator
Identifies tool necessity, validates parameters, coordinates execution plans,
and verifies consequential operations across FRIDAY's existing tool ecosystem.
"""

from __future__ import annotations
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from .intent_router import IntentCategory, IntentClassificationResult


@dataclass
class ToolExecutionPlan:
    tool_name: str
    arguments: Dict[str, Any]
    requires_confirmation: bool = False
    confirmation_reason: str = ""
    is_read_only: bool = True


@dataclass
class ToolExecutionResult:
    tool_name: str
    arguments: Dict[str, Any]
    success: bool
    result: Any
    error: Optional[str] = None
    execution_time_ms: float = 0.0


class ToolOrchestrator:
    """
    Coordinates tool discovery and execution validation for cognitive operations.
    """

    CONSEQUENTIAL_TOOLS = {
        "launch_allowed_app", "close_app", "delete_note", "batch_rename_files",
        "shutdown_system", "restart_system", "kill_process", "type_clipboard"
    }

    READ_ONLY_TOOLS = {
        "get_time_date_info", "get_live_weather", "list_notes", "search_notes",
        "find_files", "get_system_metrics", "web_search", "capture_screen",
        "read_selected_text", "manage_clipboard_history"
    }

    def plan_tool_execution(
        self,
        intent_result: IntentClassificationResult,
        user_message: str,
        require_confirmations_config: Optional[Dict[str, bool]] = None
    ) -> Optional[ToolExecutionPlan]:
        """
        Determines if a deterministic local tool should run immediately.
        """
        config = require_confirmations_config or {}
        text = (user_message or "").strip().lower()

        # 1. Direct App Launch
        if intent_result.category == IntentCategory.DESKTOP_AUTOMATION:
            if "spotify" in text:
                return ToolExecutionPlan(
                    tool_name="launch_allowed_app",
                    arguments={"appId": "spotify"},
                    requires_confirmation=config.get("launchApps", False),
                    confirmation_reason="Launch Spotify desktop application",
                    is_read_only=False
                )
            if "chrome" in text or "browser" in text:
                return ToolExecutionPlan(
                    tool_name="launch_allowed_app",
                    arguments={"appId": "chrome"},
                    requires_confirmation=config.get("launchApps", False),
                    confirmation_reason="Launch Google Chrome",
                    is_read_only=False
                )
            if "volume" in text or "mute" in text:
                action = "mute" if "mute" in text and "unmute" not in text else "get"
                return ToolExecutionPlan(
                    tool_name="control_system_volume",
                    arguments={"action": action},
                    requires_confirmation=False,
                    is_read_only=False
                )

        # 2. Weather
        if intent_result.category == IntentCategory.RESEARCH and "weather" in text:
            return ToolExecutionPlan(
                tool_name="get_live_weather",
                arguments={"city": "Hyderabad", "timeframe": "current"},
                requires_confirmation=False,
                is_read_only=True
            )

        # 3. Time / Date
        if "what time" in text or "current time" in text:
            return ToolExecutionPlan(
                tool_name="get_time_date_info",
                arguments={"query_type": "time"},
                requires_confirmation=False,
                is_read_only=True
            )

        # 4. Screen Understanding
        if intent_result.category == IntentCategory.SCREEN_UNDERSTANDING:
            return ToolExecutionPlan(
                tool_name="capture_screen",
                arguments={"displayIndex": 0},
                requires_confirmation=False,
                is_read_only=True
            )

        return None

    def validate_tool_outcome(self, result: ToolExecutionResult) -> bool:
        """
        Verifies that consequential operations reported verifiable success.
        Guards against claiming a file was saved or app was launched when it failed.
        """
        if not result.success:
            return False
        if result.error:
            return False
        if isinstance(result.result, dict):
            if result.result.get("success") is False:
                return False
            if result.result.get("error"):
                return False
        return True
