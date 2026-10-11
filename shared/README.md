# shared 共享契约

本目录只放跨端类型、DTO、枚举、事件结构和 JSON Schema，不放任何运行时业务实现。

## 当前内容

- `types/domain.ts`：任务、版本、素材、品类、模特、导出等领域类型。
- `contracts/`：后续新增 API Request / Response、WebSocket 事件和 JSON Schema。

## 规则

1. 前端 `frontend/src/types/domain.ts` 只能 re-export 本目录类型。
2. 后端 Pydantic 字段命名需通过 `alias_generator` 或显式 alias 与这里保持一致。
3. 状态值变更必须先改契约，再改前后端，并补充迁移或兼容说明。
