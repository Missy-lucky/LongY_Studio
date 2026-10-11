# LongY Studio 代码规范

> 目标：功能可以快速迭代，但层级不能乱。新增代码必须能被下一个人看懂、找到、测试和替换。

## 1. 分层原则

```text
frontend/               UI 与前端状态
desktop/electron/       桌面壳，只负责窗口与进程
backend/app/routers/    HTTP 协议层
backend/app/services/   业务规则与用例编排
backend/app/providers/  生图引擎适配
backend/app/queue/      队列与并发
backend/app/database.py SQLite 连接与迁移执行
database/               SQL 迁移
asset-library/          可版本化规则与静态资产
storage/                运行数据
tests/                  自动化测试
temp/                   可再生构建、缓存、测试、截图
```

### 调用方向

```text
router → service → provider / queue / database
```

禁止：

- Router 写复杂 SQL 或直接调用 Provider。
- Service 导入 React 或读取前端状态。
- Provider 决定业务状态机。
- Queue 绕过 service 修改业务语义。
- 前端直接访问 SQLite 或后端私有路径。

## 2. 文件命名

### Python

- 模块名使用小写蛇形：`task_planner.py`。
- 测试名使用 `test_*.py`。
- 文件名应描述职责，不使用含糊的 `utils_helper_v2.py`。
- 当前 `legacy_qc.py` 已更名为 `image_qc.py`，后续新增不要再用 `legacy` 命名正式模块。

### TypeScript / React

- React 组件文件使用 PascalCase：`ProjectLibraryDialog.tsx`。
- 非组件模块使用 kebab-case：`node-store.ts`、`built-in-data.ts`。
- 组件目录按界面区域分组：

```text
components/layout/
components/nodes/
components/common/
components/review/
components/export/
```

- 一个组件文件只导出一个主组件；类型放到 `src/types/` 或邻近的 `*.types.ts`。
- 服务端 API 调用统一放在 `src/services/api.ts`，组件不得手写 `fetch`。

### JSON 规则资产

- 品类：`asset-library/categories/{categoryId}.json`
- 套图模板：`asset-library/shot-templates/{categoryId}.json`
- 提示词模板：`asset-library/prompt-templates/{templateId}.json`
- 文件名必须使用稳定 ID，不用中文名。
- 用户上传图片、生成结果、导出结果绝不放入 `asset-library/`。

## 3. 文件大小与拆分

默认约束：

```text
新增 backend .py：≤ 400 行
新增 frontend .ts/.tsx：≤ 400 行
新增组件：≤ 300 行
```

超过时优先按以下方向拆：

- 前端 store：视图状态、任务同步、项目恢复、布局计算分文件。
- 后端 router：按资源拆文件，不合并多个资源。
- 服务：按用例拆，不按技术细节堆函数。
- Provider：适配、请求组装、结果校验分开。

当前已有历史文件可以超过阈值，但禁止继续明显膨胀；重构时逐步下降。

## 4. 前端状态规范

- Zustand store 只保存界面状态和调用结果，不复制后端事实源。
- 后端 SQLite 是任务、版本、成本、事件的事实源。
- 纯函数（布局、状态映射、格式化）放到 `services/`、`workflow/` 或 `lib/`，不要埋在 store 里。
- 异步 action 必须处理失败并写入用户可见的 `workflowMessage` 或 Toast。
- 不允许组件之间互相回调传业务函数；通过 store 或 service 调用。

## 5. 后端接口规范

- API Request / Response 字段使用 camelCase。
- 数据库字段使用 snake_case。
- Router 只做参数校验、调用 service、返回响应。
- 业务失败优先使用 `HTTPException` 携带可执行中文提示。
- 破坏性或高成本操作必须幂等，并写事件表。
- 新增接口同步更新 `docs/data-contracts.md`。

## 6. 数据与路径

- 用户图片：`storage/projects/`
- 导出：`storage/exports/`
- 缓存：`storage/cache/`
- 日志：`storage/logs/`
- SQLite：`storage/sqlite/`
- 可再生文件：`temp/`
- 代码中不得硬编码个人用户目录，例如 `C:\Users\...`。
- API Key 只能通过环境变量或本机安全存储输入，不允许进入 Git。

## 7. Git 与提交

- 主分支 `main` 保持可运行。
- 实验性大方向放 `spike/*` 分支，不混入主线。
- 提交信息使用英文祈使句：

```text
feat: add project library
fix: prevent output node overlap
chore: vendor OpenRouter CLI
```

- 每个提交尽量只做一件事；格式化和业务修改分开提交。
- 发布点打 tag，例如 `v0.6.0`。

## 8. 测试要求

新增或修改以下内容时必须跑对应检查：

```powershell
.\scripts\check-code-quality.ps1
```

覆盖：

- Backend pytest
- TypeScript build
- Python 命名与编译
- Frontend 命名
- JSON 规则资产完整性
- 大文件与秘密扫描

真实 Provider 不允许在自动化测试中扣费。

## 9. 现阶段不做的事

为了避免过早复杂化，当前主线不做：

- 自动更新
- 远程崩溃收集
- 云端账户
- 多真实 Provider 扩展
- 安装包深度优化

这些能力保留在 `spike/distribution` 分支或后续里程碑中，不阻塞当前产品闭环。
