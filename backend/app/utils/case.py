"""JSON 字段命名转换：数据库 snake_case，API 输出 camelCase。"""
import re
from typing import Any


def snake_to_camel(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(part.title() for part in parts[1:] if part)


def camelize(value: Any) -> Any:
    if isinstance(value, dict):
        return {snake_to_camel(str(k)): camelize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [camelize(item) for item in value]
    return value
