# Asset Library 可版本化规则库

本目录是品类、参考规范、模特库、提示词模板和生成预设的唯一配置源。前端与后端都从这里读取规则，不在代码里复制一份业务配置。

## 目录

| 目录 | 内容 | 使用方 |
|---|---|---|
| `categories/` | 33 个可扩展品类，含身体区域、层级、默认任务、提示词片段 | 前端品类选择、后端任务规划 |
| `categories/all.json` | 前端一次性导入的品类数组 | 前端 |
| `reference-styles/` | 平面、细节、局部、模特图规范 | 后端规范库，后续前端配置页 |
| `reference-templates/` | 旧版已验证的平面图 / 模特展示参考图 | 后端任务参考图与 Provider |
| `model-library/` | v2 定稿模特档案、参考图与风格预设 | 后端模特库、前端模特身份节点 |
| `prompt-templates/` | 旧版平面图两阶段提示词、模特硬比例提示词 | 后端提示词组装与 API 预览 |
| `generation-presets/` | 默认任务数量和草稿/高清策略 | 后端任务规划 |

## 品类配置字段

```json
{
  "id": "belt",
  "name": "腰带",
  "group": "配饰",
  "icon": "Circle",
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

## 修改规则

1. 新增品类时新增单个 JSON，并同步追加到 `categories/all.json`。
2. 修改默认任务数量、视角或提示词片段必须更新 `version` 语义说明，避免旧缓存误用。
3. 用户上传的真实图片、生成结果、导出文件不放在本目录，一律进入 `storage/`。
4. 后续如需要品类向导，也应写入本目录并由后端导入 SQLite，而不是写死在前端。


