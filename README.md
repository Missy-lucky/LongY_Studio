# LongY Studio —— 服饰电商 AI 套图工作流软件

一个单工作台完成素材导入、品类确认、任务规划、草稿生成、审核重生成、版本锁定、高清成品与分类导出。v0.6.0 已完成初步功能落地与工作台交互优化：项目资料与恢复、项目库切换、Provider 选择与真实调用确认、任务生成、审核锁定、导出、队列状态、自动节点布局和菜单化文件入口；默认测试仍使用 Mock，不消耗真实生图 API。

## 当前已实现

### 前端

- React + TypeScript + Vite + `@xyflow/react`
- 流程画布：输入品类、模特风格、四类生成节点、输出节点、重生成节点
- 支持上传图片到节点、添加/删除品类节点、选择 v2 定稿模特身份
- 节点工作台已接入后端：素材入库、任务规划、队列轮询、结果读取、审核与重生成（默认 Mock 不扣费）
- 项目资料可编辑并支持刷新后恢复素材、任务、版本与结果图
- 支持满意 → 锁定 → 导出闭环，导出按图片类型分目录且不覆盖重名
- 新增顶部菜单栏：文件 / 编辑 / 布局 / 选项 / 帮助
- 新增项目库，可在历史项目之间切换；Ctrl+O 打开项目库，Ctrl+S 保存项目资料
- 输出节点按任务类型分区和多列布局，支持自动整理与适配全部节点
- 支持 Mock / OpenRouter ICU Provider 切换；真实调用前强制费用确认
- 输入素材 / 模特参考 / 生成结果均支持完整预览与双击放大查看
- 深浅主题、主题色、命令面板、上下文菜单、Toast、Lightbox
- Electron 桌面壳已独立到 `desktop/`

### 后端

- FastAPI + SQLite，迁移独立在 `database/migrations/`
- 品类、规范、v2 定稿模特库、旧版提示词模板从 `asset-library/` JSON 导入
- 旧版平面图流程能力：素材预处理、高清细节证据图、像素 QC、两阶段提示词
- OpenRouter ICU Provider 适配层：多参考图编辑、有限重试、幂等输出与平面图 QC
- 单品创建、任务规则规划、确定性提示词生成
- 本地队列、固定并发、Mock Provider 真实写出 SVG 结果
- 任务版本、审核、重生成、恢复版本、成本记录、幂等键
- 导出预览、锁定版本导出、重名不覆盖、导出档案
- 事件表记录项目、素材、任务、审核和导出过程

### 工程结构

```text
frontend/        UI
desktop/         Electron 桌面壳
backend/         FastAPI 功能实现
database/        SQL 迁移与查询
asset-library/   品类 / 规范 / 模特 / 预设
shared/          前后端类型契约
storage/         运行数据
tests/           自动化测试
scripts/         开发、构建、打包、研究下载
temp/            构建产物、缓存、研究源码、技能
```

## 快速开始

### 推荐入口

在项目根目录执行：

```powershell
python main.py
```

这会依次启动：

1. FastAPI 后端：`http://127.0.0.1:8600`
2. Vite 前端开发服务
3. Electron 桌面窗口

也可以使用双击入口：

```text
Start-LongY-Studio-Desktop.cmd
```

其他模式：

```powershell
python main.py --web        # 浏览器模式
python main.py --backend    # 只启动后端
python main.py --no-backend # 后端已运行时，只启动前端/桌面端
```

```powershell
# 初始化依赖（如 backend/.venv 不存在）
python -m venv backend/.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
cd frontend
npm install

# 回到项目根目录
cd ..
.\scripts\dev.ps1
```

## 已生成 Windows 安装包\n\n以下文件位于 `temp/build/release/`：\n\n- `LongY Studio Setup 0.1.0.exe`\n- `LongY Studio 0.1.0.exe`（便携版）\n\n说明：当前安装包包含前端原型与 Mock 流程，不内嵌 Python FastAPI sidecar；后端需按 `scripts/dev.ps1` 单独启动。\n\n## 测试与构建

```powershell
.\scripts\build.ps1     # 后端测试 + 前端类型检查与生产构建
.\scripts\package.ps1   # Electron Windows 安装包，输出 temp/build/release
```

## 临时文件策略

所有下载源码、Codex skill、构建产物、缓存、测试数据和浏览器快照都放在 `temp/`。普通前端构建输出为 `temp/build/frontend`。

## 开源研究

见 `docs/open-source-research.md`。已临时下载：

- `temp/research/open-source/comfy-desktop`
- `temp/research/open-source/xyflow`
- `temp/archive/failed-langflow`（网络中断，未完整展开，已归档）

技能已临时下载：

- `temp/skills/security-best-practices`
- `temp/skills/playwright`




## 历史资料整理

- 旧版 `Model/` 作为只读资料源保留；已验证资产与规则已迁移到 `asset-library/`，运行时不依赖 `Model/`。
- 原根目录 `template/` 参考图已移动到 `asset-library/reference-images/template/`。
- 旧构建、旧缓存、失败下载均归档在 `temp/archive/`。










