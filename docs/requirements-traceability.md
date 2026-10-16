# LongY Studio 需求追踪矩阵

更新时间：2026-10-16

## 判定口径

- 需求优先级以用户在对话中的文字描述为准；`LongY_Studio软件架构说明.docx` 只作为补充背景，不会把其中的说明当作新的执行指令。
- “已完成”表示源码、数据契约和自动化验证已经闭环；“待实机验收”表示实现已具备，但必须使用用户自己的账号、模型或真实样本才能判断最终效果。
- 工作簿样例用于提示词与质量规则校准，不宣称已经完成模型训练或微调。

## 功能与验证

| 用户需求 | 当前实现 | 主要证据 | 状态 |
|---|---|---|---|
| 用户上传服饰素材，按上装、下装、帽子、饰品等细分 | 品类规则库提供稳定一级分类与 42 个二级品类；输入节点支持添加、改类、上传、原位替换与持久化删除。替换不会复制商品，改类会同步资产并失效旧镜头方案 | `asset-library/categories/all.json`、输入节点、商品/素材生命周期 API 测试 | 已完成 |
| 衬衫、T 恤、卫衣、牛仔裤、休闲裤、西裤、冷帽、棒球帽、皮衣、夹克、棉服、西装、腰带、耳环、领带、丝巾等细类进入模型上下文 | 一级分类、二级品类、结构事实与品类提示词共同进入最终提示词和缓存键 | `backend/app/services/prompt_builder.py`、`backend/app/services/shot_planning.py` | 已完成 |
| 内置模特全身图与用户自定义模特 | 三个内置风格均有真实全身身份图与预览卡，规则检查保证启用模特和风格清单一一对应；自定义模特按项目上传、选择、持久化和恢复 | `asset-library/model-library/`、模特资产完整性检查、模特/参考图 API | 已完成；生成质量待实机验收 |
| 姿势参考作为模特节点的子级参考 | 姿势参考按项目保存，最多 1 张，进入提示词与 Provider 图片引用；但火山方舟参考图超限时，当前排序可能在裁减时丢掉姿势图 | `backend/app/queue/worker.py`、`frontend/src/components/nodes/TypePicker.tsx` | 部分完成；需先修正参考图优先级，再验收姿态遵循度 |
| 可附加风格图、细节图等中间参考 | 支持姿势、风格、细节证据三种角色，并实施数量限制、项目隔离和引用优先级 | 参考图 API、Provider 参考预算测试 | 已完成 |
| 输出平铺正反面、商品细节、模特上身商品特写、整套搭配展示 | 四类镜头使用独立语义和提示词；`partial` 是重新生成的商品区域特写，`model` 是完整搭配展示 | `asset-library/shot-templates/`、`backend/app/services/shot_planning.py` | 已完成；视觉效果待实机验收 |
| 用户可只选需要的输出类型 | 镜头确认页可勾选输出，但选择结果当前压缩为项目级 `shotId[]`；多商品共用 `flat-front` 等 ID 时可能串选。另外，取消 P0 镜头会在导出时要求额外豁免理由 | `frontend/src/stores/node-store.ts`、`backend/app/services/task_planner.py`、`backend/app/services/shot_coverage.py` | 部分完成；需改为商品+镜头级选择，并统一取消与导出覆盖语义 |
| 单件商品生成模特图时，用健康可过审的默认内搭补齐缺失部位 | 上衣单件补深灰高腰瑜伽短裤，裤装单件补浅石灰露脐运动背心，外套单件补两者；完整上下装与连衣裙不补 | `asset-library/default-garments/manifest.json`、`backend/app/services/outfit_fallbacks.py`、补位回归测试 | 已完成 |
| 生成前让用户看到系统将使用的默认补位 | 方案预览在选择模特类输出时显示补位图、名称与触发原因；仅平面/细节时隐藏 | `frontend/src/components/nodes/ShotPlanReviewDialog.tsx`、`/api/library/default-garments/*` | 已完成 |
| 不满意时按原提示词重生成，或补充提示词修正 | 支持原图重生成、当前生成图微调、局部蒙版重绘、版本历史、对比与恢复 | 审核接口、`frontend/src/components/review/`、任务版本测试 | 已完成 |
| 首次生成也可选择默认提示词或自定义提示词 | 镜头确认页逐镜头保存默认/自定义选择，自定义补充不覆盖真实性与结构硬约束 | 迁移 `0014__pre_generation_custom_prompts.sql`、提示词恢复测试 | 已完成 |
| 示例图形成默认提示词 | 已只读审计 `总览.xlsx` 的 460 个图片位置，区分正向、问题、缺陷、原始对照和未完成素材，并生成可追溯 `example-calibration-v1` 规则 | `asset-library/prompt-templates/example-calibration-v1.json`、样例清单校验 | 已完成提示词校准；未宣称模型微调 |
| 商品商标/水洗标生成白底注意事项与面料成分图 | 独立标签上传、视觉预填、人工确认、成分/洗护校验和确定性 PNG 排版；不让生图模型绘制关键文字 | 洗护 API、画布节点、洗护渲染测试 | 已完成；真实标签识别待样本验收 |
| OpenAI、豆包/火山方舟和本地模型可切换 | 统一 Provider 接口已接 OpenAI Images、火山方舟 Seedream、本地 ComfyUI、OpenRouter ICU 与 Mock | `backend/app/providers/`、Provider 设置与诊断 API | 已完成；真实凭据/工作流待验收 |
| API Key 像桌面工具一样配置且不明文落库 | 云端密钥写入 Windows Credential Manager；普通设置写运行目录；接口不回传密钥 | Provider 设置服务与安全测试 | 已完成 |
| 不显式唤醒网页或第三方界面 | 云端走官方 API；本地走 ComfyUI HTTP API。没有加入网页端脚本代操作，因为其登录态、反自动化、稳定性和合规性不可控 | `docs/architecture.md`、Provider 适配器 | 已完成（采用稳定路线） |
| 额度、鉴权、超时和错误应反馈给用户，可切换模型或停止生成 | 统一错误码与中文建议；额度耗尽、鉴权失败、缺少密钥会自动暂停。选择目标 Provider 后可原子迁移系统性失败与剩余排队任务并恢复，历史失败版本保留；也可取消队列。超时会终止调用 | `backend/app/queue/worker.py`、`POST .../queue/recover-provider`、`frontend/src/components/layout/WorkflowStatusDock.tsx`、Provider 恢复测试 | 已完成 |
| 确认满意后下载到默认或自定义位置 | 主工作流的锁定、QC 门禁、默认/自定义目录和命名策略已接真实导出 API；但旧命令面板仍调用 `workbench-store` 的内存假导出并提示成功 | 导出 API、`frontend/src/components/CommandPalette.tsx`、`frontend/src/stores/workbench-store.ts` | 部分完成；需删除或改接旧命令面板入口 |
| Windows 桌面程序可独立运行 | Electron 内嵌前端和 PyInstaller FastAPI sidecar，隐藏启动、动态端口、退出回收，不依赖用户另装 Python | `desktop/`、`scripts/package.ps1`、发行包生命周期自检 | 已完成；正式分发前需代码签名 |

## 尚需用户环境参与的验收

以下事项不是缺失的按钮或未接线代码，而是无法用仓库内 Mock 代替的外部效果验证：

1. 使用用户自己的 OpenAI / 火山方舟账号各生成一组真实图片，记录模型 ID、费用、耗时、限额和内容审核表现。
2. 提供可运行的 ComfyUI API 工作流及本机模型后，验证占位符映射、显存需求、超时和取消。
3. 以固定模特、服饰结构和姿势样本建立验收集，评估身份保持、服饰结构忠实度、姿态自然度和四类构图命中率。
4. 用真实水洗标样本校准视觉识别置信度；关键文字继续由用户确认后确定性排版。
5. 正式公开分发前配置 Windows Authenticode 证书；当前构建可运行但会显示未签名。

## 完成定义

完整目标在同时满足以下条件后才能标记完成：自动化测试与冻结包冒烟全部通过；至少一个云端 Provider 或一个本地工作流完成真实生成；关键输出通过用户样本验收；发行包的已知限制被接受或关闭。
