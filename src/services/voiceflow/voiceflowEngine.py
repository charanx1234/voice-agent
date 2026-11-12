"""
FRIDAY VoiceFlow — Local Speech Recognition & Windows Input Engine
Listens on stdin for JSON commands:
- Whisper inference (faster-whisper)
- Windows foreground target detection (HWND tracking)
- Focus restoration & synthetic keystroke dispatch (SendInput / keybd_event)
Zero network overhead, zero cloud latency, thread-safe, and INT8-quantized.
"""

import sys
import os
import json
import time
import io
import base64
import traceback

# Suppress HuggingFace and CTranslate2 verbose logs
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

try:
    import win32gui
    import win32process
    import win32api
    import win32con
    import psutil
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

CACHE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.cache/voiceflow_models"))
os.makedirs(CACHE_DIR, exist_ok=True)

loaded_model = None
current_model_name = None

def send_response(data):
    """Sends a single-line JSON response to stdout."""
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()

def log(msg):
    """Logs diagnostics to stderr so it does not interfere with stdout JSON."""
    sys.stderr.write(f"[VoiceFlowEngine] {msg}\n")
    sys.stderr.flush()

def load_model(model_name="base", device="cpu", compute_type="int8"):
    global loaded_model, current_model_name
    if WhisperModel is None:
        raise RuntimeError("faster-whisper is not installed in the Python environment")
    
    if loaded_model is not None and current_model_name == model_name:
        return loaded_model

    log(f"Loading model '{model_name}' on {device} ({compute_type})...")
    t0 = time.time()
    loaded_model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        download_root=CACHE_DIR
    )
    current_model_name = model_name
    log(f"Model '{model_name}' loaded in {time.time()-t0:.2f}s")
    return loaded_model

def unload_model():
    global loaded_model, current_model_name
    if loaded_model is not None:
        del loaded_model
        loaded_model = None
        current_model_name = None
        log("Model unloaded to release RAM.")

def transcribe_audio(audio_bytes, language=None, model_name="base"):
    model = load_model(model_name)
    audio_stream = io.BytesIO(audio_bytes)
    
    t0 = time.time()
    lang_arg = None if (not language or language == "auto") else language

    # Whisper with built-in Silero VAD filter
    segments, info = model.transcribe(
        audio_stream,
        language=lang_arg,
        vad_filter=True,
        vad_parameters=dict(
            threshold=0.4,
            min_speech_duration_ms=160,
            min_silence_duration_ms=500,
        ),
        beam_size=5
    )

    result_segments = []
    text_parts = []
    for s in segments:
        text_parts.append(s.text.strip())
        result_segments.append({
            "start": round(s.start, 2),
            "end": round(s.end, 2),
            "text": s.text.strip()
        })

    full_text = " ".join(text_parts).strip()
    latency_ms = round((time.time() - t0) * 1000, 1)

    return {
        "text": full_text,
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
        "duration": round(info.duration, 2),
        "latency_ms": latency_ms,
        "segments": result_segments
    }

def is_terminal_process(name):
    if not name:
        return False
    lower = name.lower()
    return any(t in lower for t in ['cmd', 'powershell', 'pwsh', 'terminal', 'wt', 'conhost', 'alacritty', 'wezterm'])

def get_target_window():
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
        if "password" in cls:
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

def activate_target_window(hwnd):
    if not WIN32_AVAILABLE or not hwnd or not win32gui.IsWindow(hwnd):
        return False
    try:
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        else:
            win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
        
        cur_thread = win32api.GetCurrentThreadId()
        target_thread, _ = win32process.GetWindowThreadProcessId(hwnd)
        attached = False
        if cur_thread != target_thread:
            try:
                win32process.AttachThreadInput(cur_thread, target_thread, True)
                attached = True
            except Exception:
                pass
        
        win32gui.SetForegroundWindow(hwnd)
        
        if attached:
            win32process.AttachThreadInput(cur_thread, target_thread, False)
        return True
    except Exception as e:
        log(f"Window activation warning: {e}")
        return False

def wait_for_modifiers_released():
    if not WIN32_AVAILABLE:
        return
    keys = [win32con.VK_CONTROL, win32con.VK_SHIFT, win32con.VK_MENU, win32con.VK_LWIN, win32con.VK_RWIN]
    for _ in range(30):
        if not any((win32api.GetAsyncKeyState(k) & 0x8000) != 0 for k in keys):
            break
        time.sleep(0.01)

def send_paste_keys(is_terminal=False):
    if not WIN32_AVAILABLE:
        return False
    wait_for_modifiers_released()
    
    if is_terminal:
        # Ctrl + Shift + V for terminals
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
        win32api.keybd_event(win32con.VK_SHIFT, 0, 0, 0)
        win32api.keybd_event(ord('V'), 0, 0, 0)
        win32api.keybd_event(ord('V'), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_SHIFT, 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
    else:
        # Ctrl + V for standard apps
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
        win32api.keybd_event(ord('V'), 0, 0, 0)
        win32api.keybd_event(ord('V'), 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
    return True

def main():
    log("VoiceFlow Engine process started.")
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            cmd = json.loads(line)
            action = cmd.get("action", "")
            req_id = cmd.get("req_id")

            if action == "ping":
                send_response({"status": "ok", "req_id": req_id, "timestamp": time.time()})

            elif action == "init":
                model_name = cmd.get("model", "base")
                load_model(model_name)
                send_response({"status": "ready", "model": model_name, "req_id": req_id})

            elif action == "unload":
                unload_model()
                send_response({"status": "unloaded", "req_id": req_id})

            elif action == "transcribe":
                audio_b64 = cmd.get("audio_base64", "")
                if not audio_b64:
                    send_response({"status": "error", "error": "Missing audio_base64", "req_id": req_id})
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                lang = cmd.get("language", "auto")
                model_name = cmd.get("model", current_model_name or "base")

                result = transcribe_audio(audio_bytes, language=lang, model_name=model_name)
                send_response({"status": "ok", "result": result, "req_id": req_id})

            elif action == "get_target":
                target = get_target_window()
                send_response({"status": "ok", "target": target, "req_id": req_id})

            elif action == "paste":
                hwnd = cmd.get("hwnd", 0)
                is_terminal = cmd.get("is_terminal", False)
                if hwnd:
                    activate_target_window(hwnd)
                    time.sleep(0.04)
                
                success = send_paste_keys(is_terminal=is_terminal)
                send_response({"status": "ok", "pasted": success, "req_id": req_id})

            elif action == "exit":
                log("Received exit command. Shutting down cleanly.")
                send_response({"status": "exiting", "req_id": req_id})
                break

            else:
                send_response({"status": "error", "error": f"Unknown action: {action}", "req_id": req_id})

        except Exception as e:
            log(f"Error handling command: {traceback.format_exc()}")
            send_response({"status": "error", "error": str(e), "req_id": cmd.get("req_id") if 'cmd' in locals() else None})

if __name__ == "__main__":
    main()
