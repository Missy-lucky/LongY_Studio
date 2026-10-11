"""Provider 注册表：真实 API（如 ComfyUI / 云端生图）在此注册，任务级路由可扩展"""
from .base import Cancellable, GenerateError, GenerateRequest, GenerateResult, ImageProvider
from .mock import MockProvider
from .openrouter_icu import OpenRouterICUProvider

_registry: dict[str, ImageProvider] = {}


def register_provider(p: ImageProvider) -> None:
    _registry[p.id] = p


def resolve_provider(provider_id: str) -> ImageProvider:
    return _registry.get(provider_id, _registry["mock"])


def list_providers() -> list[dict]:
    out = []
    for p in _registry.values():
        item = {
            "id": p.id,
            "name": p.name,
            "supportedTiers": list(p.supported_tiers),
            "pricePerImage": p.price_per_image,
            "rateLimitPerMin": p.rate_limit_per_min,
        }
        availability = getattr(p, "available", None)
        if availability is not None:
            item["available"] = bool(availability)
        out.append(item)
    return out


register_provider(MockProvider())
register_provider(OpenRouterICUProvider())
