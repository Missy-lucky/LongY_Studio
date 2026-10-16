"""Provider settings with API keys stored outside project JSON and logs."""
from __future__ import annotations

import ctypes
import json
import os
import sys
from ctypes import wintypes
from pathlib import Path

from ..config import settings

SETTINGS_PATH = settings.data_dir / "settings" / "providers.json"
TARGET_PREFIX = "LongY Studio/provider/"


class _Credential(ctypes.Structure):
    _fields_ = [
        ("Flags", wintypes.DWORD),
        ("Type", wintypes.DWORD),
        ("TargetName", wintypes.LPWSTR),
        ("Comment", wintypes.LPWSTR),
        ("LastWritten", wintypes.FILETIME),
        ("CredentialBlobSize", wintypes.DWORD),
        ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)),
        ("Persist", wintypes.DWORD),
        ("AttributeCount", wintypes.DWORD),
        ("Attributes", ctypes.c_void_p),
        ("TargetAlias", wintypes.LPWSTR),
        ("UserName", wintypes.LPWSTR),
    ]


def _target(provider_id: str) -> str:
    return TARGET_PREFIX + provider_id


def _wincred():
    return ctypes.WinDLL("Advapi32.dll", use_last_error=True) if sys.platform == "win32" else None


def save_api_key(provider_id: str, api_key: str) -> None:
    key = api_key.strip()
    if not key:
        raise ValueError("API Key 不能为空")
    api = _wincred()
    if api is None:
        raise RuntimeError("当前系统不支持 Windows Credential Manager，请使用环境变量")
    blob = key.encode("utf-16-le")
    if len(blob) > 2560:
        raise ValueError("API Key 过长")
    buffer = (ctypes.c_ubyte * len(blob)).from_buffer_copy(blob)
    credential = _Credential()
    credential.Type = 1  # CRED_TYPE_GENERIC
    credential.TargetName = _target(provider_id)
    credential.CredentialBlobSize = len(blob)
    credential.CredentialBlob = ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))
    credential.Persist = 2  # CRED_PERSIST_LOCAL_MACHINE
    credential.UserName = "LongY Studio"
    api.CredWriteW.argtypes = [ctypes.POINTER(_Credential), wintypes.DWORD]
    api.CredWriteW.restype = wintypes.BOOL
    if not api.CredWriteW(ctypes.byref(credential), 0):
        raise ctypes.WinError()


def load_api_key(provider_id: str) -> str:
    env_names = {
        "openai": "OPENAI_API_KEY",
        "volcengine-ark": "ARK_API_KEY",
        "openrouter-icu": "OPENROUTER_ICU_API_KEY",
    }
    from_env = os.getenv(env_names.get(provider_id, ""), "").strip()
    if from_env:
        return from_env
    api = _wincred()
    if api is None:
        return ""
    pointer = ctypes.POINTER(_Credential)()
    api.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(_Credential))]
    api.CredReadW.restype = wintypes.BOOL
    api.CredFree.argtypes = [ctypes.c_void_p]
    if not api.CredReadW(_target(provider_id), 1, 0, ctypes.byref(pointer)):
        return ""
    try:
        credential = pointer.contents
        blob = ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize)
        return blob.decode("utf-16-le")
    finally:
        api.CredFree(pointer)


def api_key_source(provider_id: str) -> str:
    """Return the active secret source without ever returning the secret itself."""
    env_names = {
        "openai": "OPENAI_API_KEY",
        "volcengine-ark": "ARK_API_KEY",
        "openrouter-icu": "OPENROUTER_ICU_API_KEY",
    }
    if os.getenv(env_names.get(provider_id, ""), "").strip():
        return "environment"
    api = _wincred()
    if api is None:
        return "none"
    pointer = ctypes.POINTER(_Credential)()
    api.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(_Credential))]
    api.CredReadW.restype = wintypes.BOOL
    api.CredFree.argtypes = [ctypes.c_void_p]
    if not api.CredReadW(_target(provider_id), 1, 0, ctypes.byref(pointer)):
        return "none"
    api.CredFree(pointer)
    return "credential-manager"


def delete_api_key(provider_id: str) -> None:
    api = _wincred()
    if api is None:
        return
    api.CredDeleteW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD]
    api.CredDeleteW.restype = wintypes.BOOL
    api.CredDeleteW(_target(provider_id), 1, 0)


def read_provider_settings() -> dict[str, dict]:
    if not SETTINGS_PATH.is_file():
        return {}
    try:
        value = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def write_provider_settings(provider_id: str, values: dict) -> dict:
    all_settings = read_provider_settings()
    current = all_settings.get(provider_id, {})
    current.update({key: value for key, value in values.items() if value is not None})
    all_settings[provider_id] = current
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(SETTINGS_PATH) + ".tmp")
    temporary.write_text(json.dumps(all_settings, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(SETTINGS_PATH)
    return current


def provider_setting(provider_id: str, key: str, default: str = "") -> str:
    value = read_provider_settings().get(provider_id, {}).get(key, default)
    return str(value).strip() if value is not None else default
