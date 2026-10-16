# 数据契约（v0.4）

前端 `src/types/domain.ts`、后端 SQLite Schema 与本文档保持一致。
真实接入后端后，字段不重命名，仅允许新增可选字段。

## 商品 Item 与结构事实

```json
{
  "id": "item-xxx",
  "projectId": "proj-xxx",
  "name": "针织上衣",
  "categoryId": "shirt",
  "attributes": { "hasChestPocket": true },
  "structureFacts": {
    "silhouette": "直筒宽松",
    "neckline": "翻领",
    "closure": "前中七粒纽扣",
    "pockets": "左胸单贴袋",
    "logoPosition": "无标识"
  },
  "colorMaterial": "燕麦色 / 粗针织",
  "sellingPoints": "重磅针织",
  "isSellable": true
}
```

结构字段定义由 `GET /api/library/structure-fields` 返回；适用字段根据一级分类和二级品类过滤。`PATCH /api/projects/{projectId}/items/{itemId}` 保存品类、属性与结构事实。后端拒绝未知字段、非字符串和超长值，任务规划时将已填写事实写入正向提示词与禁止擅改的负向约束，并参与缓存键计算。

商品输入节点遵循稳定身份语义：

- `POST /api/projects/{projectId}/assets/{assetId}/replace` 原位替换图片内容，保留 `assetId`、`itemId`、视角和品类绑定，不会暗中创建第二个商品。
- 修改二级品类会同步更新该商品全部资产的 `categoryId`，并清除旧品类的镜头选择、任务与未导出的生成版本，防止旧提示词继续参与生成。
- `DELETE /api/projects/{projectId}/items/{itemId}` 删除商品、绑定素材、任务与项目内生成文件；已复制到用户导出目录的文件不删除。

## 首次生成前的镜头提示词

镜头方案通过 `PUT /api/projects/{projectId}/tasks/shot-selections` 保存。每个进入生成队列的镜头可选择默认提示词，或在默认约束之后追加用户自定义要求：

```json
{
  "itemId": "item-xxx",
  "shotId": "flat-front",
  "status": "selected",
  "promptHints": "正面完整平铺，双袖对称展开",
  "promptMode": "custom",
  "customPrompt": "构图略微靠上，四周留出更宽的白边"
}
```

`promptMode` 为 `default | custom`。`custom` 不替换商品权威图、结构事实、搭配清单、模特身份和参考图职责等防漂移约束，而是作为附加生成要求进入最终提示词及缓存键。切回 `default` 后保留已填写文本供再次切换，但任务规划不会使用该文本。

默认提示词还会加载版本化的 `example-calibration-v1` 配置。该配置记录来源清单及正向/问题/缺陷证据数量，并按 `flat | detail | partial | model` 注入不同防漂移规则。它是基于样例人工审计得到的提示词校准配置，不表示底层生图模型已经完成微调训练。

## 不完整穿搭默认补位

`asset-library/default-garments/manifest.json` 是唯一默认补位素材清单，固定提供 `upper-base` 与 `lower-base` 两个角色。当前分别为无品牌浅石灰短款露脐运动背心和深灰高腰瑜伽短裤。

- 仅 `partial` / `model` 任务使用实图补位；`flat` / `detail` 不使用。
- 缺上身基础层时补背心，缺下装时补瑜伽短裤；外套单件补两者，连衣裙视为上下层均完整。
- 清单中的 SHA-256 必须匹配素材文件，并进入任务缓存键。
- Provider 参考图排序为真实商品优先、默认补位随后，再放模特身份与姿势/风格；火山方舟的 10 图上限会提前预留身份和风格槽位。

生成前的 `POST /api/projects/{projectId}/tasks/plan/preview` 会返回 `outfitFallbacks`，每项包含 `id`、`role`、`name`、`reason` 与只读 `previewUrl`。镜头确认页仅在当前选中了 `partial` 或 `model` 镜头时显示这些补位卡片；用户改为仅生成平面图/细节图后会立即隐藏。

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

报告的 `structure` 字段会逐项列出输入节点保存的商品结构事实，并明确标记 `human_review_required`。当前视觉 QC 不声称已经自动识别领型、扣件数量等语义事实；用户必须先点击“满意”完成原图人工对照，随后才可锁定。

`review` 的 `lock` 操作仅允许任务已经 `accepted` 且当前版本 `qc_passed=1`。未人工确认、未通过或尚未完成 QC 时返回 `409`；导出接口会再次校验该条件，避免绕过前端门禁。

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

## 项目参考图导入

```http
POST /api/projects/{projectId}/references/import
```

上传的 `pose`、`style` 或 `detail` 参考图会计算 SHA-256。若精确命中 `asset-library/qc-rules/reference-workbook.json` 中已确认的问题生成结果或缺陷证据，接口返回 `422`；原始商品对照与未完成素材不在阻断集合中。

## Provider 能力声明

```json
{
  "id": "mock",
  "name": "Mock 生图引擎",
  "supportedTiers": ["draft", "hd"],
  "pricePerImage": { "draft": 1, "hd": 4 },
  "rateLimitPerMin": 60,
  "costEstimateKnown": true,
  "available": true,
  "capabilities": {
    "textToImage": true,
    "imageEdit": true,
    "maskEdit": true,
    "maxReferenceImages": 16,
    "customBaseUrl": false,
    "local": true
  }
}
```

云端 Provider 的实时价格无法由本地配置可靠确定时，`costEstimateKnown=false` 且估算值为 0；提交确认界面必须显示“以 Provider 实际账单为准”，不能把它表达为免费。用户可配置草稿/高清单张估价、单批张数上限和单批预估费用上限；任务提交还会检查项目剩余预算。估价为 0 时仅能依靠张数上限，不能声称费用已被精确控制。

## Provider 配置诊断

```http
POST /api/provider-settings/{providerId}/diagnose
```

该接口只检查本地配置、工作流文件与无计费连通性，不调用任何图片生成端点。OpenAI 使用模型查询验证密钥和模型；火山方舟尝试模型列表查询；ComfyUI 验证工作流 JSON、`{{PROMPT}}` 占位符与本地 `/system_stats`；OpenRouter ICU 只验证密钥与 CLI 文件存在，因此远端认证会保留为提醒。

```json
{
  "diagnostic": {
    "providerId": "openai",
    "status": "ready",
    "canGenerate": true,
    "networkChecked": true,
    "billableRequest": false,
    "message": "配置和无计费连通性检查均通过，可以提交生成任务。",
    "checks": [
      { "id": "api-key", "label": "API Key", "status": "pass", "message": "已安全配置" },
      { "id": "connectivity", "label": "无计费连通性", "status": "pass", "message": "密钥认证与模型查询成功" }
    ]
  }
}
```

`status` 为 `ready | warning | error`，检查项状态为 `pass | warn | fail`。`warning` 表示本次无计费请求无法证明真实生图权限，不能等同于生成一定成功。

### 生成失败与自动暂停

`TaskVersion.errorCode` 与 `errorMessage` 会原样进入输出节点和底部任务监控。`errorMessage` 同时保留 Provider 给出的恢复建议。遇到 `QUOTA_EXCEEDED`、`AUTHENTICATION_FAILED` 或 `API_KEY_MISSING` 时，队列在当前并发批次结束后自动暂停，不再领取后续任务；前端禁用盲目批量重试，并提供 Provider 设置、迁移恢复与取消剩余任务入口。

`POST /api/projects/{projectId}/tasks/queue/recover-provider` 接收 `{ provider }`，只处理两类任务：仍在排队的任务，以及当前版本错误码属于上述三类系统性故障的失败任务。失败任务会保留旧失败版本并创建新生成版本；排队任务会连同尚未提交的生成版本迁移到目标 Provider。内容审核、图片质量等业务失败不会被批量迁移。若目标 Provider 不支持任务的蒙版能力，或迁移后超过张数/费用上限，任务会保留原状并进入 `skipped` 明细。接口写入 `queue.provider_recover` 事件并在存在可迁移任务时恢复队列。

## 人物授权与多角度身份包

自定义模特导入必须提交 `rightsConfirmed=true` 和 `rightsBasis=self|licensed|consent`。授权依据、备注和确认时间持久化，未确认时接口返回 `422`。主图作为 `front` 参考；项目还可为同一模特上传三分之四、侧面、背面和面部细节，每个角度最多一张。模特类任务按身份优先级自动带入多角度参考。

## AI 导出清单

每个导出批次会在目标目录写入 `LongY-AI-export-manifest-{batchId}.json`。生成图标记为 `ai-generated`，原始素材标记为 `original`；清单记录相对路径、SHA-256、Provider、模型和版本。清单是来源审计，不替代目标电商平台要求的页面标识。

## 洗护与成分图 CareCard

```json
{
  "id": "care-xxx",
  "projectId": "proj-xxx",
  "sourceAssetId": "asset-xxx | null",
  "brand": "LONGY",
  "productName": "棉质衬衫",
  "data": {
    "composition": [
      { "name": "棉", "percent": 50 },
      { "name": "聚酯纤维", "percent": 50 }
    ],
    "instructions": ["max_30", "do_not_bleach", "line_dry"],
    "warnings": ["深浅色衣物请分开洗涤"]
  },
  "filePath": "projects/proj-xxx/care/care-xxx.png"
}
```

`composition` 合计必须为 100%，`instructions` 不得重复或互相冲突；输出固定为确定性白底 PNG。

### 水洗标识别草稿

`POST /api/projects/{projectId}/care-cards/extract` 返回 `requiresConfirmation=true`，以及每个成分、洗护方式和注意事项的置信度、逐行原文 `rawText` 与 `uncertainFields`。识别结果不能直接创建成品，前端必须要求用户对照原图确认。

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


