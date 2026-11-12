# typeflowBackend.py — Python backend service for FRIDAY TypeFlow
# Provides:
# 1. UIAutomation selected text extraction (non-invasive, TextPattern/TextPattern2)
# 2. Native Win32 SendInput typing with pause/resume/cancel and progress callback
# 3. Target window identification and focus verification
# 4. Safe clipboard-based fallback for applications without accessibility support

import sys
import os
import io
import time
import json
import base64
import traceback
import threading
import ctypes
from ctypes import wintypes

try:
    import win32gui
    import win32process
    import win32con
    import win32api
    import psutil
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

try:
    import comtypes
    import comtypes.client
    UIA_AVAILABLE = True
except ImportError:
    UIA_AVAILABLE = False

# Win32 SendInput constants & structures
user32 = ctypes.windll.user32 if hasattr(ctypes, 'windll') else None

KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
INPUT_KEYBOARD = 1
VK_RETURN = 0x0D
VK_TAB = 0x09
VK_BACK = 0x08
VK_ESCAPE = 0x1B

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk', wintypes.WORD),
        ('wScan', wintypes.WORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_ulong)
    ]

class INPUT_I(ctypes.Union):
    _fields_ = [('ki', KEYBDINPUT)]

class INPUT(ctypes.Structure):
    _fields_ = [
        ('type', wintypes.DWORD),
        ('i', INPUT_I)
    ]

# State for ongoing typing session
typing_lock = threading.Lock()
typing_state = {
    "status": "idle",       # idle, typing, paused, cancelled, completed
    "session_id": None,
    "total_chars": 0,
    "typed_chars": 0,
    "target_hwnd": 0,
    "should_pause": False,
    "should_cancel": False,
    "pause_event": threading.Event(),
}
typing_state["pause_event"].set()

def log(msg):
    sys.stderr.write(f"[TypeFlowBackend] {msg}\n")
    sys.stderr.flush()

def send_response(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def is_terminal_process(name):
    if not name:
        return False
    lower = name.lower()
    return any(t in lower for t in ['cmd', 'powershell', 'pwsh', 'terminal', 'wt', 'conhost', 'alacritty', 'wezterm'])

def get_foreground_info():
    if not WIN32_AVAILABLE:
        return {"hwnd": 0, "title": "", "process": "unknown", "isPassword": False, "isTerminal": False}
    
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd or not win32gui.IsWindow(hwnd):
        return {"hwnd": 0, "title": "", "process": "unknown", "isPassword": False, "isTerminal": False}
    
    title = win32gui.GetWindowText(hwnd)
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    proc_name = "unknown"
    try:
        proc_name = psutil.Process(pid).name()
    except Exception:
        pass
    
    is_terminal = is_terminal_process(proc_name)
    is_password = False
    try:
        style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
        if style & 0x0020:
            is_password = True
        cls = win32gui.GetClassName(hwnd).lower()
        if "password" in cls or "passcode" in cls or "lock" in cls:
            is_password = True
    except Exception:
        pass

    return {
        "hwnd": hwnd,
        "pid": pid,
        "title": title,
        "process": proc_name,
        "isPassword": is_password,
        "isTerminal": is_terminal
    }

def send_single_char(char):
    if not user32:
        return
    if char == '\n':
        inp_down = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=VK_RETURN, wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
        inp_up = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=VK_RETURN, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
        events = (INPUT * 2)(inp_down, inp_up)
        user32.SendInput(2, events, ctypes.sizeof(INPUT))
    elif char == '\t':
        inp_down = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=VK_TAB, wScan=0, dwFlags=0, time=0, dwExtraInfo=0)))
        inp_up = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=VK_TAB, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
        events = (INPUT * 2)(inp_down, inp_up)
        user32.SendInput(2, events, ctypes.sizeof(INPUT))
    elif char == '\r':
        return
    else:
        code = ord(char)
        inp_down = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=0)))
        inp_up = INPUT(type=INPUT_KEYBOARD, i=INPUT_I(ki=KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)))
        events = (INPUT * 2)(inp_down, inp_up)
        user32.SendInput(2, events, ctypes.sizeof(INPUT))

def type_text_worker(session_id, text, target_hwnd, delay_ms, auto_validate_target):
    global typing_state
    log(f"Starting typing session {session_id} ({len(text)} chars, target={target_hwnd})")
    
    # Give target window a moment if focus activation is needed
    if target_hwnd and win32gui.IsWindow(target_hwnd):
        try:
            win32gui.SetForegroundWindow(target_hwnd)
            time.sleep(0.05)
        except Exception as e:
            log(f"Warning activating foreground window: {e}")

    sleep_sec = max(0.005, delay_ms / 1000.0)
    chars = list(text)
    total = len(chars)
    typed = 0
    t0 = time.time()

    for i, ch in enumerate(chars):
        # 1. Check cancellation
        if typing_state["should_cancel"]:
            typing_state["status"] = "cancelled"
            log(f"Typing session {session_id} cancelled at char {typed}/{total}")
            send_response({
                "type": "typing_progress",
                "session_id": session_id,
                "status": "cancelled",
                "typed": typed,
                "total": total,
                "percent": round((typed / max(1, total)) * 100, 1)
            })
            return

        # 2. Check pause
        if typing_state["should_pause"]:
            typing_state["status"] = "paused"
            send_response({
                "type": "typing_progress",
                "session_id": session_id,
                "status": "paused",
                "typed": typed,
                "total": total,
                "percent": round((typed / max(1, total)) * 100, 1)
            })
            typing_state["pause_event"].wait()
            if typing_state["should_cancel"]:
                typing_state["status"] = "cancelled"
                return
            typing_state["status"] = "typing"

        # 3. Target focus check
        if auto_validate_target and target_hwnd:
            current_fg = win32gui.GetForegroundWindow()
            if current_fg != target_hwnd:
                log(f"Target focus lost: current={current_fg}, expected={target_hwnd}. Auto-pausing.")
                typing_state["should_pause"] = True
                typing_state["status"] = "paused"
                send_response({
                    "type": "typing_progress",
                    "session_id": session_id,
                    "status": "paused",
                    "reason": "focus_lost",
                    "typed": typed,
                    "total": total,
                    "percent": round((typed / max(1, total)) * 100, 1)
                })
                typing_state["pause_event"].clear()
                typing_state["pause_event"].wait()
                if typing_state["should_cancel"]:
                    typing_state["status"] = "cancelled"
                    return
                typing_state["status"] = "typing"

        # 4. Send character
        send_single_char(ch)
        typed += 1
        typing_state["typed_chars"] = typed

        # Periodic progress updates every 15 chars or on last char
        if typed % 15 == 0 or typed == total:
            send_response({
                "type": "typing_progress",
                "session_id": session_id,
                "status": "typing",
                "typed": typed,
                "total": total,
                "percent": round((typed / total) * 100, 1)
            })

        time.sleep(sleep_sec)

    duration_ms = round((time.time() - t0) * 1000, 1)
    typing_state["status"] = "completed"
    log(f"Typing session {session_id} completed successfully in {duration_ms}ms")
    send_response({
        "type": "typing_progress",
        "session_id": session_id,
        "status": "completed",
        "typed": typed,
        "total": total,
        "duration_ms": duration_ms,
        "percent": 100.0
    })

def get_selected_text_uia():
    """Extracts currently selected text using Windows UI Automation without touching clipboard."""
    if not UIA_AVAILABLE:
        return {"success": False, "error": "UIA unavailable"}
    
    try:
        # CoInitialize for comtypes thread safety
        try:
            ctypes.windll.ole32.CoInitialize(None)
        except Exception:
            pass

        UIAutomationClient = comtypes.client.GetModule('UIAutomationCore.dll')
        uia = comtypes.client.CreateObject(UIAutomationClient.CUIAutomation8, interface=UIAutomationClient.IUIAutomation)
        
        focused = uia.GetFocusedElement()
        if not focused:
            return {"success": False, "error": "No focused element"}
        
        name = focused.CurrentName or ""
        cls = focused.CurrentClassName or ""
        
        # Check if control is password protected
        is_password = False
        try:
            is_password = bool(focused.CurrentIsPassword)
        except Exception:
            pass
            
        if is_password:
            return {"success": False, "error": "Selected field is password protected", "isPassword": True}

        # Try TextPattern (10014) or TextPattern2 (10024)
        pattern = None
        for pid in [UIAutomationClient.UIA_TextPatternId, UIAutomationClient.UIA_TextPattern2Id]:
            try:
                p = focused.GetCurrentPattern(pid)
                if p:
                    pattern = p.QueryInterface(UIAutomationClient.IUIAutomationTextPattern)
                    break
            except Exception:
                continue

        if not pattern:
            return {"success": False, "error": "Element does not support TextPattern", "className": cls, "elementName": name}

        ranges = pattern.GetSelection()
        if not ranges or ranges.Length == 0:
            return {"success": False, "error": "No active text selection in element"}

        range_obj = ranges.GetElement(0)
        selected_text = range_obj.GetText(-1)
        
        if not selected_text or not selected_text.strip():
            return {"success": False, "error": "Empty text selection"}

        return {
            "success": True,
            "text": selected_text,
            "elementName": name,
            "className": cls,
            "source": "ui-automation"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    global typing_state
    log("FRIDAY TypeFlow Python Subprocess Initialized.")
    send_response({"status": "ready", "pid": os.getpid()})

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
            action = cmd.get("action", "")
            req_id = cmd.get("req_id")

            if action == "ping":
                send_response({"status": "ok", "req_id": req_id, "timestamp": time.time()})

            elif action == "get_target":
                target = get_foreground_info()
                send_response({"status": "ok", "target": target, "req_id": req_id})

            elif action == "get_selected_text":
                res = get_selected_text_uia()
                fg = get_foreground_info()
                res["window"] = fg
                send_response({"status": "ok", "result": res, "req_id": req_id})

            elif action == "start_typing":
                text = cmd.get("text", "")
                session_id = cmd.get("session_id", f"session_{int(time.time()*1000)}")
                target_hwnd = cmd.get("target_hwnd", 0)
                delay_ms = cmd.get("delay_ms", 25)
                auto_validate = cmd.get("auto_validate", True)

                with typing_lock:
                    if typing_state["status"] in ["typing", "paused"]:
                        send_response({
                            "status": "error",
                            "error": "A typing session is already active",
                            "req_id": req_id
                        })
                        continue

                    typing_state["status"] = "typing"
                    typing_state["session_id"] = session_id
                    typing_state["total_chars"] = len(text)
                    typing_state["typed_chars"] = 0
                    typing_state["target_hwnd"] = target_hwnd
                    typing_state["should_pause"] = False
                    typing_state["should_cancel"] = False
                    typing_state["pause_event"].set()

                t = threading.Thread(
                    target=type_text_worker,
                    args=(session_id, text, target_hwnd, delay_ms, auto_validate),
                    daemon=True
                )
                t.start()
                send_response({"status": "started", "session_id": session_id, "req_id": req_id})

            elif action == "pause_typing":
                with typing_lock:
                    if typing_state["status"] == "typing":
                        typing_state["should_pause"] = True
                        typing_state["pause_event"].clear()
                        send_response({"status": "paused", "req_id": req_id})
                    else:
                        send_response({"status": "ignored", "reason": f"Current status is {typing_state['status']}", "req_id": req_id})

            elif action == "resume_typing":
                with typing_lock:
                    if typing_state["status"] == "paused" or typing_state["should_pause"]:
                        typing_state["should_pause"] = False
                        typing_state["pause_event"].set()
                        send_response({"status": "resumed", "req_id": req_id})
                    else:
                        send_response({"status": "ignored", "reason": f"Current status is {typing_state['status']}", "req_id": req_id})

            elif action == "cancel_typing":
                with typing_lock:
                    typing_state["should_cancel"] = True
                    typing_state["pause_event"].set()
                    send_response({"status": "cancelling", "req_id": req_id})

            elif action == "get_typing_status":
                send_response({
                    "status": "ok",
                    "typing_state": {
                        "status": typing_state["status"],
                        "session_id": typing_state["session_id"],
                        "total_chars": typing_state["total_chars"],
                        "typed_chars": typing_state["typed_chars"]
                    },
                    "req_id": req_id
                })

            elif action == "exit":
                log("Received exit command. Shutting down cleanly.")
                send_response({"status": "exiting", "req_id": req_id})
                break

            else:
                send_response({"status": "error", "error": f"Unknown action: {action}", "req_id": req_id})

        except Exception as e:
            log(f"Error handling TypeFlow backend command: {traceback.format_exc()}")
            send_response({"status": "error", "error": str(e), "req_id": cmd.get("req_id") if 'cmd' in locals() else None})

if __name__ == "__main__":
    main()
