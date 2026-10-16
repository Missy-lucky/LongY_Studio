# LongY Studio 架构说明

LongY Studio 是一个 Windows 桌面端服饰电商 AI 套图工作流软件。当前已完成项目恢复、项目库切换、Provider 选择与安全配置、真实调用确认、任务审核锁定、导出、队列状态、菜单化文件入口与自动节点布局；Mock 仍是默认测试 Provider，不消耗真实 API。

## 总体架构

```text
desktop/electron        桌面窗口、窗口 IPC、sidecar 启停与健康检查
        ↓
frontend/               React + TypeScript + React Flow 单工作台
        ↓ HTTP / WebSocket（后续增量事件）
backend/                FastAPI：素材、单品、任务规划、队列、审核、导出
        ↓
database/               SQLite 迁移与查询定义
asset-library/          品类、规范、模特、提示词模板、生成预设
storage/                SQLite 文件、素材、缓存、日志、导出结果
temp/                   研究源码、构建产物、缓存、测试数据
```

开发态由 `main.py` 启动 FastAPI、Vite 与 Electron。打包态由 Electron 隐藏启动内嵌的 PyInstaller sidecar；sidecar 同时提供 `/api/*` 和打包前端静态资源，因此发行版不依赖 Vite、Python 或外部后端进程。

## 关键原则

1. **单一事实源**：任务、版本、成本和事件以后端 SQLite 为准；前端状态只做交互缓存。
2. **规则优先**：任务拆解与提示词填充由本地规则完成，不消耗大模型 token。
3. **草稿优先**：默认低清草稿；锁定后才允许高清成品。
4. **版本不覆盖**：重生成创建新版本，历史版本可恢复。
5. **成本可控**：任务规划返回数量、缓存命中和预估成本；调用写入 provider_calls 与 cost_events。
6. **文件与数据库分离**：SQLite 只存相对路径，图片和导出文件保存在 `storage/`。
7. **临时产物集中**：所有构建、缓存、测试、研究源码和截图进入 `temp/`。
8. **旧版能力复用**：已验证的 v2 模特身份、平面图参考图、提示词与像素 QC 进入正式规则库 / 服务层；`Model/` 只作只读历史资料源。
9. **密钥隔离**：云端 API Key 只进入 Windows Credential Manager，不写 SQLite、项目 JSON、日志或前端响应。
10. **官方接口优先**：OpenAI Images API 与火山方舟 Image generation API 直接接入；本地生成通过 ComfyUI HTTP API 工作流，不依赖网页自动化。

## 后端任务状态机

```text
planned → cached
planned/cached → queued → generating → review
review → accepted → locked → exported
review → rejected → queued
generating → failed → queued
```

## 目录分层

详细职责见 `docs/directory-ownership.md`。

```text
frontend/    UI 与前端状态
desktop/     桌面壳
backend/     FastAPI 服务与业务实现
database/    SQL 迁移
asset-library/ 可版本化规则库
shared/      前后端契约
storage/     运行数据
tests/       自动化测试
scripts/     开发与构建脚本
temp/        可再生临时资料
```

## 本地开发

统一主入口：

```powershell
cd D:\BaiduNetdiskDownload\LongY_Studio
python main.py
```

也可以使用：

```powershell
.\Start-LongY-Studio-Desktop.cmd
```

浏览器模式：

```powershell
python main.py --web
```

- 后端：`http://127.0.0.1:8600/api/health`
- 前端：`http://127.0.0.1:5173`

## 校验与打包

```powershell
.\scripts\build.ps1
.\scripts\package.ps1
```

构建输出在 `temp/build/`，不会向项目根目录散落产物。`package.ps1` 先冻结后端、再生成安装版与便携版，最后执行真实 Electron → sidecar 启动/关闭自检。生成的 `LongY Studio Setup 0.1.0.exe` 与便携版 `LongY Studio 0.1.0.exe` 是本地可再生产物，不提交到 Git。





