# 目录职责与文件放置规范

本项目采用“单仓库、多分层”的结构。新增文件时先判断职责，再选择目录，禁止把 UI、业务、SQL、素材和运行数据混在同一层。

## 根目录

| 目录 | 职责 | 禁止事项 |
|---|---|---|
| `frontend/` | React UI、组件、前端状态、样式、前端服务封装 | 直接访问 SQLite、读取后端私有路径、保存 API Key |
| `desktop/` | Electron/Tauri 桌面壳、窗口 IPC、安装入口 | 写生成业务规则、管理商品素材 |
| `backend/` | FastAPI 接口、业务服务、队列、Provider 适配、仓储层 | 写 React 组件或样式 |
| `database/` | SQL 迁移、查询、数据库文档 | 写业务流程；保存用户图片 |
| `asset-library/` | 可版本化的品类、规范、模特、提示词模板、生成预设 | 保存用户上传原图或生成结果 |
| `frontend/src/workflow/` | 前端纯逻辑：节点布局、任务状态映射、项目恢复图构建 | 放组件、_hooks 或直接 API 调用 |
| `shared/` | 前后端共享类型、事件契约、JSON Schema | 放运行时实现 |
| `storage/` | SQLite、用户素材、缓存、日志、导出结果 | 提交到 Git；存放源码 |
| `tests/` |后端集成测试、前端测试、端到端测试 | 依赖真实外部 API 扣费 |
| `docs/` |需求、架构、目录、数据契约、研究记录 | 放临时截图或构建产物 |
| `main.py` | 统一启动入口，负责拉起后端、前端和桌面端 | 写业务逻辑 |
| `scripts/` |开发、构建、打包、研究下载脚本 | 长期保存生成结果 |
| `temp/` |下载源码、技能、构建产物、缓存、测试数据、浏览器快照 | 作为正式源码或交付目录 |

## backend 内部分层

```text
backend/app/
├─ api 或 routers/   # HTTP / WebSocket 协议层
├─ services/         # 业务规则与用例编排
├─ workflows/        # 后续复杂流程编排
├─ queue/            # 本地任务队列与并发控制
├─ providers/        # 生图 API 适配器
├─ repositories/     # 数据访问，不写业务判断
├─ core 或 config.py # 配置、日志、安全
└─ main.py           # 组装入口
```

当前约束：

1. Router 只做参数校验和调用 service，不写复杂 SQL。
2. Service 不直接依赖 React 状态。
3. Repository 不调用 Provider。
4. Provider 不决定任务状态，只返回结果或错误。
5. Queue 是唯一把任务从 queued 推向 generating/review/failed 的模块。

## 临时文件策略

所有可再生或非源码文件进入：

```text
temp/build/       # 前端构建、安装包
temp/cache/       # npm、Python、浏览器缓存
temp/tests/       # 测试运行数据
temp/research/    # 下载的开源源码
temp/skills/      # 下载的 Codex skill
temp/artifacts/   # 截图、快照、日志
```

前端普通 
pm run build` 输出到 `temp/build/frontend`；只有打包脚本会临时生成 `frontend/dist` 供 Electron Builder 使用，安装包输出到 `temp/build/release`。

## 已整理的历史资料

- `Model/` 是只读旧版资料源：脚本与历史文档仅作迁移参考，不再参与当前工程构建。
- 已验证的 v2 模特参考图、平面图参考图与提示词已复制进 `asset-library/`，运行时不读取 `Model/`。
- 原根目录 `template/` 参考图已移动到 `asset-library/reference-images/template/`。
- 项目根目录只保留正式分层目录、`README.md`、`pytest.ini` 和 `.gitignore`。





## 代码规范

命名、层级、文件大小和新增文件要求见 `docs/coding-standards.md`。提交前运行 `scripts/check-code-quality.ps1`。
