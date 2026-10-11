# 数据契约（v0.4）

前端 `src/types/domain.ts`、后端 SQLite Schema 与本文档保持一致。
真实接入后端后，字段不重命名，仅允许新增可选字段。

## 任务 Task

```json
{
  "id": "task-xxx",
  "code": "T001",
  "name": "针织高领上衣 正面 平面图",
  "type": "flat | detail | partial | model",
  "itemId": "item-xxx",
  "modelId": "chinese-grand | null",
  "tier": "draft | hd",
  "status": "planned | cached | queued | generating | review | accepted | rejected | failed | locked | exported",
  "provider": "mock",
  "prompt": "电商平面图，正面视角…",
  "negativePrompt": "不改变版型…",
  "estimatedCost": 1,
  "cacheHit": false,
  "error": null,
  "versions": ["ver-xxx"],
  "currentVersionId": "ver-xxx",
  "queueIndex": 3
}
```

## 版本 TaskVersion

```json
{
  "id": "ver-xxx",
  "version": 2,
  "createdAt": "2026-10-11T01:00:00Z",
  "tier": "draft",
  "status": "review | accepted | rejected | locked | exported | failed",
  "reason": "color | structure | background | composition | detail | model | consistency | style",
  "note": "领口变形",
  "provider": "mock",
  "cost": 1,
  "durationMs": 3600,
  "qcScore": 0.82,
  "qcPassed": true,
  "qcReportPath": "storage/projects/project/generated/version.qc.json",
  "thumbnail": "data:image/svg+xml;..."
}
```

## 事件 Event（前端恢复界面的依据）

```json
{
  "id": 1024,
  "time": "01:02:03",
  "projectId": "proj-xxx",
  "taskId": "task-xxx",
  "type": "queue.start | task.done | task.fail | review.accept | review.reject | task.regenerate | export.done",
  "message": "T003 针织高领上衣 领口 细节图 v2 已生成，等待审核"
}
```

### 高清修复 Action

```http
POST /api/projects/{projectId}/tasks/{taskId}/hd-repair
```

```json
{
  "version": 2,
  "versionId": "ver-xxx",
  "tier": "hd"
}
```

### 版本 QC

```http
GET /api/projects/{projectId}/tasks/{taskId}/versions/{versionId}/qc
```

返回 `score`、`passed` 与完整一致性 QC 报告。

## 品类配置 CategoryConfig

```json
{
  "id": "belt",
  "name": "腰带",
  "bodyZone": "腰部",
  "layerOrder": 40,
  "requiredViews": ["正面", "扣头特写", "孔位", "边缘"],
  "defaultDetailTasks": ["扣头", "皮纹", "孔位", "边缘"],
  "defaultPartialTasks": ["腰身展示", "扣头特写"],
  "modelPromptHints": "佩戴于腰部，不遮挡服装主要图案",
  "negativeHints": "不改变扣形，不添加额外孔位",
  "isSellableByDefault": true,
  "builtin": false
}
```


## 模特档案 ModelProfile

```json
{
  "id": "chinese-grand",
  "name": "M1 中国风大气",
  "pose": "正面全身 / 三四分全身 / 背面全身",
  "styles": ["新中式", "连衣裙", "礼服", "高级感"],
  "skinTone": "健康自然东方肤色",
  "hair": "黑色长直发，中分或微侧分",
  "referencePath": "asset-library/model-library/v2/chinese-grand/fullbody.png",
  "licenseNote": "内部 v2.0 定稿身份资产",
  "enabled": true
}
```

## Provider 能力声明

```json
{
  "id": "mock",
  "name": "Mock 生图引擎",
  "supportedTiers": ["draft", "hd"],
  "pricePerImage": { "draft": 1, "hd": 4 },
  "rateLimitPerMin": 60,
  "available": true
}
```

## 缓存键（需求 10.3）

```
cache_key = sha256(
  素材哈希列表
  + 品类与任务规则版本
  + 提示词模板版本
  + 关键参数（分辨率/比例/模型/风格强度/种子）
  + Provider 与模型版本
  + 目标输出类型
)
```

## 导出文件节点

```json
{
  "taskId": "task-xxx",
  "folder": "A100_套图/针织高领上衣",
  "fileName": "A100-针织高领上衣-正面平面图.jpg",
  "version": 3,
  "conflict": false
}
```

## API 命名规则

- 数据库内部字段使用 `snake_case`。
- API Request Body 与 Response Body 统一使用 `camelCase`。
- 后端转换工具：`backend/app/utils/case.py`。
- 前端共享类型：`shared/types/domain.ts`。
- 任务、版本、素材、单品的字段名必须与本文档保持一致；新增字段只能在兼容情况下追加。


