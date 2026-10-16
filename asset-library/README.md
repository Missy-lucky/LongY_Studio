# Asset Library 可版本化规则库

本目录是品类、参考规范、模特库、提示词模板和生成预设的唯一配置源。前端与后端都从这里读取规则，不在代码里复制一份业务配置。

## 目录

| 目录 | 内容 | 使用方 |
|---|---|---|
| `categories/` | 42 个二级品类，含一级分类、身体区域、层级、默认任务、提示词片段 | 前端品类选择、后端任务规划 |
| `categories/all.json` | 前端一次性导入的品类数组 | 前端 |
| `reference-styles/` | 平面、细节、局部、模特图规范 | 后端规范库，后续前端配置页 |
| `reference-templates/` | 旧版已验证的平面图 / 模特展示参考图 | 后端任务参考图与 Provider |
| `default-garments/` | 不完整穿搭的无品牌默认内搭图及 SHA-256 清单 | 模特商品特写、整套搭配任务与缓存键 |
| `model-library/` | v2 定稿模特档案、参考图与风格预设 | 后端模特库、前端模特身份节点 |
| `prompt-templates/` | 旧版平面图两阶段提示词、模特硬比例提示词、示例证据校准规则 | 后端提示词组装与 API 预览 |
| `generation-presets/` | 默认任务数量和草稿/高清策略 | 后端任务规划 |
| `qc-rules/` | 从参考工作簿提取的正向、问题与未完成样例清单 | 参考图导入拦截与质量回归测试 |
| `structure-fields.json` | 版型、领型、袖型、闭合件、口袋、腰头、下摆、图案与标识等结构事实字段 | 输入节点、提示词锁定、审核清单 |

## 品类配置字段

```json
{
  "id": "belt",
  "name": "腰带",
  "group": "配饰",
  "parentId": "accessory",
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
5. 结构字段的 ID 是持久化契约；可追加字段或调整适用品类，不得直接重命名已经保存的 ID。
6. `example-calibration-v1.json` 的证据计数必须与 `qc-rules/reference-workbook.json` 一致；它表示人工审计后的提示词校准，不表示训练或微调了模型。
7. `default-garments/manifest.json` 固定包含 `upper-base` 与 `lower-base` 各一项；文件哈希必须匹配。修改图片会改变模特图任务缓存语义。


