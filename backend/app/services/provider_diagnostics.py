"""Non-billable readiness diagnostics for image Provider adapters."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx

from ..config import PROJECT_ROOT
from .provider_config import load_api_key, provider_setting

ProviderId = Literal["openai", "volcengine-ark", "openrouter-icu", "comfyui"]
CheckStatus = Literal["pass", "warn", "fail"]


def _check(check_id: str, label: str, status: CheckStatus, message: str) -> dict[str, str]:
    return {"id": check_id, "label": label, "status": status, "message": message}


def _report(provider_id: ProviderId, checks: list[dict[str, str]], network_checked: bool) -> dict[str, Any]:
    statuses = {item["status"] for item in checks}
    status = "error" if "fail" in statuses else ("warning" if "warn" in statuses else "ready")
    messages = {
        "ready": "配置和无计费连通性检查均通过，可以提交生成任务。",
        "warning": "配置可用于尝试生成，但仍有项目只能在真实调用时确认。",
        "error": "配置尚不可用，请先修正失败项。",
    }
    return {
        "providerId": provider_id,
        "status": status,
        "canGenerate": "fail" not in statuses,
        "networkChecked": network_checked,
        "billableRequest": False,
        "message": messages[status],
        "checks": checks,
    }


def _cloud_diagnostic(
    provider_id: Literal["openai", "volcengine-ark"],
    default_base_url: str,
    default_model: str,
) -> dict[str, Any]:
    checks: list[dict[str, str]] = []
    api_key = load_api_key(provider_id)
    model = provider_setting(provider_id, "model", default_model)
    base_url = provider_setting(provider_id, "baseUrl", default_base_url).rstrip("/")
    checks.append(_check(
        "api-key", "API Key", "pass" if api_key else "fail",
        "已安全配置" if api_key else "尚未配置 API Key",
    ))
    checks.append(_check(
        "model", "模型 ID", "pass" if model else "fail",
        model if model else "模型 ID 为空",
    ))
    checks.append(_check(
        "base-url", "服务地址", "pass" if base_url else "fail",
        base_url if base_url else "服务地址为空",
    ))
    if not api_key or not model or not base_url:
        return _report(provider_id, checks, False)

    path = f"/models/{quote(model, safe='')}" if provider_id == "openai" else "/models"
    try:
        with httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(6.0),
            follow_redirects=True,
        ) as client:
            response = client.get(path)
    except httpx.TimeoutException:
        checks.append(_check("connectivity", "无计费连通性", "fail", "请求超时，请检查网络或服务地址"))
        return _report(provider_id, checks, True)
    except httpx.HTTPError as exc:
        checks.append(_check("connectivity", "无计费连通性", "fail", f"无法连接 Provider：{type(exc).__name__}"))
        return _report(provider_id, checks, True)

    if response.status_code == 200:
        checks.append(_check("connectivity", "无计费连通性", "pass", "密钥认证与模型查询成功"))
    elif response.status_code in {401, 403}:
        checks.append(_check("connectivity", "无计费连通性", "fail", "API Key 无效、失效或无权访问"))
    elif response.status_code == 429:
        checks.append(_check("connectivity", "无计费连通性", "warn", "认证请求被限流，请稍后再试"))
    elif provider_id == "openai" and response.status_code == 404:
        checks.append(_check("connectivity", "无计费连通性", "fail", "模型不存在或当前账户无权访问"))
    elif provider_id == "volcengine-ark" and response.status_code in {404, 405}:
        checks.append(_check(
            "connectivity", "无计费连通性", "warn",
            "服务可达，但当前地址未开放模型列表；密钥与模型需在首次生成时确认",
        ))
    elif response.status_code >= 500:
        checks.append(_check("connectivity", "无计费连通性", "fail", "Provider 服务暂时不可用"))
    else:
        checks.append(_check(
            "connectivity", "无计费连通性", "fail",
            f"Provider 返回 HTTP {response.status_code}，请检查地址、密钥和模型",
        ))
    return _report(provider_id, checks, True)


def _comfyui_diagnostic() -> dict[str, Any]:
    provider_id: ProviderId = "comfyui"
    checks: list[dict[str, str]] = []
    workflow_value = provider_setting(provider_id, "workflowPath")
    workflow_path = Path(workflow_value) if workflow_value else None
    workflow_valid = False
    if not workflow_path or not workflow_path.is_file():
        checks.append(_check("workflow", "API 工作流", "fail", "工作流 JSON 不存在"))
    else:
        try:
            workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
            workflow_text = json.dumps(workflow, ensure_ascii=False)
            workflow_valid = isinstance(workflow, dict) and "{{PROMPT}}" in workflow_text
            checks.append(_check(
                "workflow", "API 工作流", "pass" if workflow_valid else "fail",
                "JSON 有效且包含 {{PROMPT}} 占位符"
                if workflow_valid else "根节点必须是对象，并至少包含 {{PROMPT}} 占位符",
            ))
        except (OSError, json.JSONDecodeError):
            checks.append(_check("workflow", "API 工作流", "fail", "工作流不是有效 JSON"))

    base_url = provider_setting(provider_id, "baseUrl", "http://127.0.0.1:8188").rstrip("/")
    checks.append(_check("base-url", "本地服务地址", "pass", base_url))
    if not workflow_valid:
        return _report(provider_id, checks, False)
    try:
        with httpx.Client(base_url=base_url, timeout=httpx.Timeout(3.0)) as client:
            response = client.get("/system_stats")
    except httpx.TimeoutException:
        checks.append(_check("connectivity", "ComfyUI 服务", "fail", "连接超时，请确认 ComfyUI 已启动"))
    except httpx.HTTPError as exc:
        checks.append(_check("connectivity", "ComfyUI 服务", "fail", f"无法连接：{type(exc).__name__}"))
    else:
        checks.append(_check(
            "connectivity", "ComfyUI 服务", "pass" if response.status_code == 200 else "fail",
            "本地服务已响应" if response.status_code == 200 else f"本地服务返回 HTTP {response.status_code}",
        ))
    return _report(provider_id, checks, True)


def _openrouter_diagnostic() -> dict[str, Any]:
    provider_id: ProviderId = "openrouter-icu"
    configured = provider_setting(provider_id, "cliPath")
    cli_path = Path(configured) if configured else PROJECT_ROOT / "tools" / "openrouter_icu_image.py"
    key_configured = bool(load_api_key(provider_id))
    cli_available = cli_path.is_file()
    base_url = provider_setting(provider_id, "baseUrl", "https://tokenadvent.com").rstrip("/")
    model = provider_setting(provider_id, "model", "gpt-image-2.5")
    checks = [
        _check("api-key", "API Key", "pass" if key_configured else "fail", "已安全配置" if key_configured else "尚未配置 API Key"),
        _check("cli", "ICU CLI", "pass" if cli_available else "fail", str(cli_path) if cli_available else "CLI 文件不存在"),
        _check("base-url", "服务地址", "pass" if base_url else "fail", base_url or "服务地址为空"),
        _check("model", "模型 ID", "pass" if model else "fail", model or "模型 ID 为空"),
    ]
    if key_configured and cli_available:
        checks.append(_check(
            "connectivity", "远端认证", "warn",
            "为避免产生图片调用，本次只验证本地 CLI 与密钥存在性；远端认证将在首次生成时确认",
        ))
    return _report(provider_id, checks, False)


def diagnose_provider(provider_id: ProviderId) -> dict[str, Any]:
    """Return an actionable report without invoking any image-generation endpoint."""
    if provider_id == "openai":
        return _cloud_diagnostic(provider_id, "https://api.openai.com/v1", "gpt-image-2.5-sunburst")
    if provider_id == "volcengine-ark":
        return _cloud_diagnostic(
            provider_id,
            "https://ark.cn-beijing.volces.com/api/v3",
            "doubao-seedream-5-0-lite-260128",
        )
    if provider_id == "comfyui":
        return _comfyui_diagnostic()
    return _openrouter_diagnostic()
