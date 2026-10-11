# 修改日志

## v0.7.1 — 质检报告中文化（2026-10-11）

- 一致性 QC 报告界面全面中文化：
  - 指标名：颜色相似度、结构相似度、面部几何相似度、清晰度方差等。
  - 失败原因：未检测到面部、面部几何发生变化、服装一致性未通过等。
  - 管线阶段：基础生成、高清细节修复。
  - 档位：草稿版、高清修复版。
  - 布尔值：是 / 否；空值：未记录 / 未评分。
- 输出节点徽标从 `QC` / `HD Repair` / `Draft` 调整为 `质检` / `高清修复` / `草稿`。
- 后端 JSON 字段名保持英文以维持 API 和数据库契约稳定；中文转换只发生在展示层。

---


## v0.7.0 — 高清修复与一致性 QC（2026-10-11）

### 高清成品链路
- `hd` 不再只是分辨率参数，改为两阶段生产链路：
  1. 基础图生成。
  2. 专用高清细节修复：面料纹理、缝线、扣件、拉链、口袋、手部、脸部皮肤与身份细节。
- OpenRouter ICU 高清阶段会把「已审基础图 + 原始服装参考 + 定稿模特参考」重新送入细节修复，不允许只放大构图。
- 高清修复失败时不会把仅放大图伪装成成品，会返回 `HD_DETAIL_REPAIR_FAILED` 并建议重试。
- 新增 `POST /api/projects/{projectId}/tasks/{taskId}/hd-repair`，基于当前任务创建新 HD 版本。
- 输出节点新增「高清修复」按钮；完成后显示「高清修复」档位标识。
- HD 估算成本调整为两阶段成本，Mock 与 OpenRouter 均为 5。
- Mock Provider 从 SVG 占位改为真实 PNG，并模拟 HD 细节纹理，保证预览、尺寸、QC 与导出链路可测试。
- 套图模板声明的输出尺寸优先于 Provider 默认尺寸。

### 一致性 QC
- 新增 `backend/app/services/consistency_qc.py`，从单一像素 QC 扩展为多信号一致性 QC：
  - 服装一致性：HSV 分布、感知哈希、ORB 结构匹配与单应性内点。
  - 模特身份：MediaPipe 面部几何、面部区域外观、身体比例。
  - 输出细节：Laplacian 清晰度、边缘密度、高频能量、源分辨率。
  - 原像素 QC：白边、覆盖率、安全边界与尺寸。
- 模特身份采用保守加权：
  - 面部几何 45%。
  - 面部区域结构/颜色 40%。
  - 身体比例 15%。
- 使用三位 v2 定稿模特交叉验证：
  - 同一参考图对比自身：通过。
  - M1 vs M2：判定身份不一致。
  - M1 vs M3：判定身份不一致。
- QC 报告随版本落盘为 `<result>.qc.json`。
- `task_versions` 新增 `qc_score`、`qc_passed`、`qc_report_path`。
- 新增 `GET /api/projects/{projectId}/tasks/{taskId}/versions/{versionId}/qc`。
- 输出节点显示 QC 分数与通过状态。
- 点击输出节点质检徽标可查看完整中文报告：档位、管线、服装一致性、模特身份、输出细节与像素质检。
- Mock Provider 的 QC 只记录不阻断；真实 Provider 执行一致性阈值并给出失败原因。
- 导出档案会同时包含“用原图满足”的素材文件，并写入 `export_asset_files` 档案表。

### 依赖与模型
- 新增 `opencv-python-headless`、`mediapipe`。
- 将已验证的面部与姿态模型纳入 `asset-library/qc-models/`：
  - `face_landmarker.task`
  - `pose_landmarker_heavy.task`

### 修复
- 修复套图模板重复规划时任务编号未递增导致 `UNIQUE(project_id, code)` 失败的问题。
- 完整全身模特图面部较小时，MediaPipe 会依次尝试上半身裁切并将坐标映射回原图。

### 验证
- 后端测试：11 passed。
- TypeScript / Vite 构建：通过。
- 结构 / 命名 / JSON 资产检查：0 错误。
- Mock HD 流程验证：draft → HD 新版本 → 1152×1536 PNG → QC 报告落盘 → QC API 可读取。

---


## v0.6.1 — 工程规范与结构治理（2026-10-11）

### 工程
- 在 `D:\LongY_Studio` 初始化 Git，建立 `main` 分支和 `v0.6.0` 基线。
- 清理 C 盘旧副本，后续只以 D 盘工程为唯一工作目录。
- 将 OpenRouter ICU CLI 复制到项目内 `tools/`，移除对个人 Codex 技能目录的运行时依赖。
- 将过早的桌面分发实验保存到 `spike/distribution` 分支，主线暂停打包方向，避免当前阶段复杂化。

### 代码规范
- 新增 `docs/coding-standards.md`，明确：
  - backend / frontend / desktop / asset-library / storage 的职责边界。
  - Python、TypeScript、React、JSON 规则资产的命名规则。
  - 文件大小阈值与拆分方向。
  - API 字段、运行数据、Git 提交和测试要求。
- 新增 `scripts/check-code-quality.ps1` 与 `scripts/check_code_quality.py`：
  - 检查 Python 语法与命名。
  - 检查 React / TypeScript 命名。
  - 检查根目录层级。
  - 检查品类、套图模板、提示词模板 JSON 完整性。
  - 扫描个人绝对路径与疑似 API Key。
  - 检查 Git 中是否误跟踪运行数据。
  - 串联后端测试与前端构建。
- `scripts/build.ps1` 改为调用统一质量检查入口。

### 结构重构
- `legacy_qc.py` 更名为 `image_qc.py`，职责命名更直观。
- `canvas/nodes.tsx` 更名为 `canvas/CanvasNodes.tsx`，符合组件命名。
- 新增 `frontend/src/workflow/`：
  - `node-layout.ts`：节点自动布局。
  - `task-sync.ts`：后端任务状态到节点状态的映射。
  - `project-restore.ts`：项目恢复时的图结构构建。
- `node-store.ts` 从约 950 行降至约 800 行以内，纯逻辑移出 store；该文件仍标记为历史大文件，后续继续拆分。

### 规则资产
- 纳入 33 个品类的 `asset-library/shot-templates/` 套图模板。
- 质量检查会校验：
  - 品类与模板一一对应。
  - shot id 唯一。
  - 任务类型与优先级合法。
  - 条件镜头引用的属性已声明。
  - 参考图角色存在。

---


## v0.6.0 — 交互、布局与项目入口优化（2026-10-11）

### 交互命中与关闭行为
- 类型选择器支持键盘 `Esc` 和右上角实体 `Esc` 按钮关闭。
- 输入节点删除、替换、放大，模特切换，输出放大、移除等小按钮统一扩大到 36×36 CSS 命中区。
- 画布最小缩放从 0.3 提高到 0.7，避免大量节点时按钮被缩小到难以点击。
- 输出审核 / 锁定 / 重试按钮统一提高命中高度。
- 菜单栏支持 `Esc` 与空白区域点击关闭。

### 节点布局
- 输出节点不再简单排成一列，改为按任务类型分区，每区最多 3 列，超过后换行。
- 处理节点纵向位置按该类型输出数量动态扩展，避免上一组输出与下一组处理 / 输出互相覆盖。
- 新增「布局 → 自动整理布局」与「适配全部节点」。
- 生成方案和恢复项目时都会执行自动布局，连线继续保留 `素材 → 处理 → 输出` 关系。

### 文件与项目入口
- 新增顶部菜单栏：文件、编辑、布局、选项、帮助。
- 文件菜单包含：
  - 新建项目
  - 打开项目库
  - 保存项目资料
  - 导出锁定图
- 新增项目库弹窗：列出后端项目、SKU、平台、风格、更新时间与当前项目标记，可一键切换。
- `Ctrl+O` 打开项目库，`Ctrl+S` 保存项目资料。
- 新建项目会创建空白画布并弹出项目资料表单；不会丢掉后端历史项目。
- 画布左侧工具条只保留画布内高频动作，项目 / 文件类操作统一归入菜单，避免功能重复。

### 压力与回归验证
- 3 个素材输入生成 15 个输出节点：
  - 输出节点渲染 15 / 15。
  - 生成图片 15 / 15。
  - 输出节点矩形重叠数 0。
  - 连线 32 条，多于输出节点数，保留了图结构。
- 所有可见按钮物理宽高均不低于 22px；删除节点实际命中 25.2×25.2px。
- 类型选择器 `Esc` 键与实体按钮关闭均通过。
- 菜单空白区域点击关闭通过。
- 新建项目验证：项目引用清空、4 个默认空输入节点、资料表单自动打开。
- 项目库切换验证：从当前项目切换到历史项目后，localStorage 项目 ID 正确变化。
- 前端 TypeScript / 生产构建通过。
- 后端测试 2 passed。

---


## v0.5.0 — 初步功能落地（2026-10-11）

### 项目与持久化
- 新增项目资料编辑：SKU、名称、平台、风格、预算；项目创建前后都可修改。
- 新增 `PATCH /api/projects/{id}`，修改 SKU 时检查重复。
- 当前项目 ID 写入 localStorage；重启 / 刷新后自动恢复项目资料、素材节点、模特选择、任务节点、任务状态与结果图。
- 新建空白工作台会清除当前项目引用，并弹出项目资料表单。

### Provider 落地
- 节点工作台新增 Provider 选择器：Mock 与 OpenRouter ICU。
- 后端任务规划按所选 Provider 写入 provider、估价与缓存键。
- OpenRouter ICU 调用前强制弹出费用与风险确认；取消时不提交任何真实 API 请求。
- Provider 不可用时阻止提交并提示检查 API Key / CLI。
- 切换 Provider 会清空当前未执行方案，避免 Mock / 真实任务混用。

### 审核与导出落地
- 输出节点状态补全：待审核 → 满意 → 锁定 → 导出。
- 满意后可锁定当前版本；锁定版本才允许导出。
- 新增「导出锁定图」：调用后端导出预览与导出接口，按平面 / 细节 / 局部 / 模特分目录，不覆盖重名文件。
- 导出结果弹窗显示成功数、失败原因与完整写入路径。
- 输出节点支持从本次方案移除；失败与不满意任务可直接重试 / 重生成。

### 队列与顶栏统一
- 顶栏「准备 / 生成 / 审核 / 导出」接入节点工作台真实动作，不再驱动旧 Mock store。
- 底部队列条接入节点输出任务：总数、完成数、生成中、失败数、累计成本、当前状态消息。
- 队列展开后显示排队 / 生成中任务缩略图，并支持失败重试、移除任务。
- 修正后端 submit 只允许 planned / cached / failed 入队，避免已审核或已锁定任务被重复提交。

### 稳定性修复
- 修复新增状态选择器返回新数组导致的 React infinite loop / 白屏问题。
- 审核按钮改为覆盖在输出图片底部，避免节点高度变化后按钮被画布裁切或遮挡。

### 验证
- Mock 端到端：项目资料保存 → 素材入库 → 任务规划 → 6/6 生成 → 审核 → 锁定 → 导出 → 刷新恢复，全部通过。
- OpenRouter ICU 安全拦截：切换真实 Provider 后提交会弹出确认，点击取消未发生真实 API 请求。
- 后端测试：2 passed。
- 前端 TypeScript / 生产构建通过。

---

## v0.4.2 — 图片完整预览与放大查看（2026-10-11）

### 新增
- 新增节点通用图片查看器：
  - 双击输入素材 / 模特参考图 / 生成结果打开大图。
  - 大图使用 `object-contain` 完整显示，不裁切。
  - 支持双击在 100% / 200% 间切换。
  - 支持按钮缩放、重置、拖拽平移、键盘 `+` / `-` / `Esc`。
  - 支持在新窗口打开原图。
- 输入节点增加「放大查看」与「替换素材」悬停按钮；有图后单击不再误触上传。
- 模特节点双击可查看完整 1024×1536 身份参考图；节点内仍使用轻量预览保证性能。
- 输出节点增加「放大查看」按钮，生成图完整显示。

### 修复
- 输出节点从固定 4:5 `object-cover` 裁切改为按任务类型使用 1:1 / 3:4 容器与 `object-contain`，生成结果不再被裁切。
- 输入节点预览同步改为 `object-contain`，替换入口改为悬停按钮，避免双击查看与上传手势冲突。

### 验证
- 输出节点 Mock 结果：`object-fit=contain`，768×768 原图完整显示。
- 双击输出图打开查看器：100% → 200% 正常。
- 放大后拖拽：transform 从 `translate(0,0) scale(2)` 变为 `translate(80,50) scale(2)`。
- 输入素材与模特参考图双击查看均通过。
- 前端 TypeScript / 生产构建通过。

---

## v0.4.1 — 节点工作台稳定性修复（2026-10-11）

### 修复
- 模特参考节点从 4:3 裁切预览改为 2:3 完整 `object-contain` 预览，不再只显示胸腹局部。
- 生成 360×540 轻量模特卡片图，节点默认读取 preview，真实生成仍使用完整 1024×1536 身份参考。
- 画布显式开启拖拽平移与滚轮平移，并启用可见区域渲染，降低大画布开销。
- 上传素材预览从大体积 Base64 改为 Blob URL，替换/删除节点时释放对象，降低内存与重渲染压力。
- 模特选择写入 localStorage，画布初始化增加防重入；窗口重载或短暂渲染恢复后不再默认回到 M1。
- 后端队列 supervisor 空闲后自动退出，避免长时间 0.25 秒 CPU 唤醒。
- Electron 保留默认 GPU 加速以保证流畅度；如确认是显卡驱动白屏，可用 `LONGY_DISABLE_GPU=1` 临时切换软件渲染。
- Electron 监听 renderer process gone 并记录原因后恢复窗口。
- 前端新增工作台 ErrorBoundary，渲染异常时显示可重试错误面板，不再直接整窗白屏。

### 压力与回归
- 连续切换模特 91 次：最终保持 M2，刷新后仍保持 M2。
- 上传 3 张模板图并生成 16 个 Mock 任务：16/16 输出成功。
- 10 秒空转浸泡：无页面错误、无白屏，JS heap 从约 38.9MB 降至约 16.4MB。
- 空转渲染帧率约 82 FPS。
- 滚轮平移检测：viewport transform 发生变化，平移可用。

---

## v0.4.0 — 旧版生产能力迁移（2026-10-11）

### 新增
- 迁移旧版 v2.0 三位模特定稿资产与档案：M1 中国风大气、M2 韩系甜酷、M3 欧美飒爽。
- 迁移旧版平面图主提示词、细节保真二次精修提示词、模特图硬比例规则到 `asset-library/prompt-templates/legacy-v2.json`。
- 新增 OpenRouter ICU Provider 适配器：
  - 多参考图编辑、草稿/高清尺寸策略、有限重试、取消、幂等输出路径。
  - 平面图生成后自动执行旧版像素 QC（尺寸、白边、覆盖率、安全边界）。
- 新增旧版确定性预处理 / QC 服务：
  - EXIF 转正、上传图压缩、4 格高清细节证据图、1536 平面图规范化。
  - 白边、覆盖率、主体边界与结构相关性测量。
- 素材接口支持 HEIC / HEIF / TIFF / BMP，导入时记录真实宽高。
- 新增接口：
  - `GET /api/library/prompt-templates`
  - `GET /api/library/models/{id}/reference`
  - `GET /api/projects/{id}/assets/{id}/quality`
  - `POST /api/projects/{id}/assets/{id}/legacy-plan-view/prepare`
  - `GET /api/projects/{id}/tasks/{id}/versions/{id}/file`
- 前端模特节点切换为三位 v2 定稿身份，并通过后端安全读取参考图。
- 节点工作台接入真实后端闭环：上传素材入库、创建单品、任务规划、队列提交、状态轮询、结果读取与审核重生成；默认仍使用 Mock Provider，不产生费用。
- 任务规划接口支持 `modelIds`，前端只按当前选定的 v2 模特创建模特任务。
- Vite 开发服务代理 `/api` 到 FastAPI。
- 已用现有模板图完成浏览器端冒烟：上传入库 → 生成方案 → 提交 Mock 队列 → 轮询生成 6 个结果 → 结果文件接口全部读取成功。

### 修复
- 后端任务规划此前存在模特任务空转问题；现在会按启用模特 × 视角真实创建任务。
- 素材确认接口支持 camelCase 请求字段。
- 任务队列写入 `current_version_id` / `idempotency_key` 的参数顺序错误。

### 文件变更
```text
新增：
  asset-library/prompt-templates/legacy-v2.json
  asset-library/reference-templates/
  asset-library/model-library/v2/
  backend/app/services/legacy_qc.py
  backend/app/providers/openrouter_icu.py

修改：
  asset-library/model-library/
  backend/app/routers/assets.py
  backend/app/routers/library.py
  backend/app/routers/tasks.py
  backend/app/services/prompt_builder.py
  backend/app/services/task_planner.py
  backend/app/queue/worker.py
  backend/app/providers/
  frontend/src/services/api.ts
  frontend/src/data/built-in-data.ts
  frontend/src/stores/node-store.ts
  frontend/vite.config.ts
  shared/types/domain.ts
  tests/backend/test_api_workflow.py
  docs/
```

---

## v0.3.0 — 节点系统（2026-10-11）

### 新增
- **节点系统替代固定 Tab 布局**
  - 输入节点：28 种穿搭部位类型，用户可增删/拖拽/替换/修改类型
  - 模特风格节点：6 种内置风格，可切换/预览
  - 处理节点：平面图/细节图/局部图/模特图，显示模型参数和预估
  - 输出节点：显示生成结果，带状态/版本号/审核按钮
- **连线系统**
  - 5 种连线类型（素材/模特/生成/审核/重生成），颜色区分
  - 自动连线：添加输入节点时自动连到所有处理节点
  - 连线约束：防止非法连接
- **重生成版本树**
  - 不满意 → 重生成 → 新输出节点（v+1）
  - 版本连线保留，画布上可见迭代历史
- **类型选择器**
  - 底部弹出，带搜索，按大类分组
  - 28 个预设类型 + 自定义类型入口
- **模特选择器**
  - 底部弹出，按风格分类展示

### 修改
- `App.tsx`：用 `NodeCanvas` 替代 `ImageGrid`
- `global.css`：新增节点相关样式（端口/连线/卡片）
- `package.json`：恢复 `@xyflow/react` 依赖

### 文件变更
```
新增：
  frontend/src/types/node-system.ts
  frontend/src/data/preset-categories.ts
  frontend/src/stores/node-store.ts
  frontend/src/components/nodes/NodeComponents.tsx
  frontend/src/components/nodes/TypePicker.tsx
  frontend/src/components/nodes/NodeCanvas.tsx
  docs/node-system-design.md

修改：
  frontend/src/App.tsx
  frontend/src/styles/global.css
  frontend/package.json
```

---

## v0.2.0 — 交互层 + 主题系统（2026-10-11）

### 新增
- **命令面板**（Ctrl+K）：搜索功能/任务/快捷操作
- **全局快捷键**：Ctrl+1~4 切模式、Ctrl+Enter 生成、Ctrl+R 重生成、Ctrl+S 保存
- **右键菜单**：图片上右键可重生成/删除/另存为/复制提示词/查看大图
- **悬停操作条**：图片悬停时底部浮出 4 个操作按钮
- **骨架屏**：生成中显示对应尺寸的微光扫过效果
- **批量操作**：全选/反选/满意/不满意/重生成
- **进度条**：底部带百分比和当前步骤
- **可展开任务队列**：底部点击展开查看详情
- **参数面板**：右侧滑出 + 折叠分组 + 固定按钮
- **主题系统**：浅色/深色 + 6 种自定义主色
- **列表错开淡入**：每项延迟 25ms 形成瀑布感
- **勾选反馈**：红色半透明遮罩 + 弹出动画

### 修改
- 顶栏：加搜索/保存/主题/更多菜单按钮（视觉入口）
- 左侧导航：图标 + 文字标签 + 帮助按钮
- 空状态：加"导入素材"和"生成方案"按钮
- Toast：滑入动画 + 2 秒自动消失

---

## v0.1.0 — 初始框架（2026-10-11）

### 新增
- React + TypeScript + Vite + Tailwind CSS 前端框架
- FastAPI + SQLite 后端骨架
- 五区布局：顶栏/左侧导航/主内容/参数面板/底部队列
- 四模式：准备/生成/审核/导出
- 假 Provider：模拟生成流程
- 审核闭环：接受/拒绝/重生成/锁定/版本
- 导出预览：文件树/重名处理
- Electron 桌面壳：无边框窗口 + 自定义标题栏
- 架构文档 + 数据契约文档










