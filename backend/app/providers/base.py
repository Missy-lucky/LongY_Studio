"""Provider 统一接口：能力声明、计价、限流、重试与取消（需求 18.2）
后续接入真实生图 API（云端 / ComfyUI）时实现本接口并注册即可，业务层不改。"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, Literal

Tier = Literal["draft", "hd"]
TaskType = Literal["flat", "detail", "partial", "model"]


@dataclass
class GenerateRequest:
    task_id: str
    tier: Tier
    prompt: str
    negative_prompt: str
    seed: int = 0
    task_type: TaskType = "flat"
    reference_paths: list[str] = field(default_factory=list)


@dataclass
class GenerateResult:
    file_path: str
    cost: float
    duration_ms: int


@dataclass
class GenerateError:
    code: str
    message: str
    suggestion: str
    retryable: bool = False


StageCallback = Callable[[str, str], None]
CompleteCallback = Callable[[GenerateResult], None]
ErrorCallback = Callable[[GenerateError], None]


class ImageProvider(ABC):
    id: str
    name: str
    supported_tiers: tuple[Tier, ...]
    price_per_image: dict[Tier, float]
    rate_limit_per_min: int = 60
    max_retries: int = 2

    def estimate(self, tier: Tier, count: int) -> float:
        return self.price_per_image.get(tier, 0.0) * count

    @abstractmethod
    def generate(
        self,
        req: GenerateRequest,
        on_stage: StageCallback,
        on_complete: CompleteCallback,
        on_error: ErrorCallback,
        idempotency_key: str,
    ) -> "Cancellable":
        ...


@dataclass
class Cancellable:
    """生成句柄：支持取消，避免用户误操作持续扣费"""
    task_id: str
    cancel: Callable[[], None]
