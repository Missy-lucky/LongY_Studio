# LongY Studio —— 服饰电商 AI 套图工作流软件

一个单工作台完成素材导入、品类确认、任务规划、草稿生成、审核重生成、版本锁定、高清成品与分类导出。当前主流程已升级为可导航的“准备 → 生成 → 审核 → 导出”工作流，支持动态操作台、可调尺寸监控台、画布轻量交互、新手/正常模式、云端生图队列、提示词修正和原图重画/当前图微调。当前默认测试仍使用 Mock，不消耗真实生图 API。详细进度见 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)。

## 当前已实现

### 前端

- React + TypeScript + Vite + `@xyflow/react`
- 流程画布：输入品类、模特风格、四类生成节点、输出节点、重生成节点
- 支持上传图片到节点、添加/删除品类节点、选择 v2 定稿模特身份
- 节点工作台已接入后端：素材入库、任务规划、队列轮询、结果读取、审核与重生成（默认 Mock 不扣费）
- Provider：OpenRouter ICU、OpenAI Images API、火山方舟 Seedream、本地 ComfyUI；API Key 可在界面中安全保存到 Windows Credential Manager，并可执行不触发生图计费的配置诊断
- 独立洗护/成分链路：结构化事实校验后确定性渲染白底 PNG，不使用生图模型绘制文字
- 项目资料可编辑并支持刷新后恢复素材、任务、版本与结果图
- 支持满意 → 锁定 → 导出闭环，导出按图片类型分目录且不覆盖重名
- HD 成品采用两阶段链路：基础生成 + 高清细节修复，不再是单纯放大
- 版本级一致性 QC 覆盖服装结构/颜色、模特面部身份、身体比例与输出细节
- 新增顶部菜单栏：文件 / 编辑 / 布局 / 选项 / 帮助
- 新增项目库，可在历史项目之间切换；Ctrl+O 打开项目库，Ctrl+S 保存项目资料
- 输出节点按任务类型分区和多列布局，支持自动整理与适配全部节点
- 镜头确认阶段可在首次生成前逐镜头选择默认提示词或填写自定义补充，选择会随项目保存并进入任务缓存键
- 支持 Mock / OpenRouter ICU / OpenAI / 火山方舟 / ComfyUI Provider 切换；真实调用前强制确认
- 输入素材 / 模特参考 / 生成结果均支持完整预览与双击放大查看
- 深浅主题、主题色、命令面板、上下文菜单、Toast、Lightbox
- Electron 桌面壳已独立到 `desktop/`
- 动态左侧步骤操作台、可拖拽宽度和可折叠监控台
- 新手模式 / 正常模式及首次启动流程引导
- 画布缩放、空节点上传、素材替换、图片预览和审核定位
- 审核提示词修正：原图重画、当前图微调、局部蒙版重绘
- 审核与导出列表分页、显示更多和实时阶段进度

### 后端

- FastAPI + SQLite，迁移独立在 `database/migrations/`
- 品类、规范、v2 定稿模特库、旧版提示词模板从 `asset-library/` JSON 导入
- 旧版平面图流程能力：素材预处理、高清细节证据图、像素 QC、两阶段提示词
- 统一 Provider 适配层：多参考图编辑、有限重试、取消、幂等输出、错误映射与平面图 QC
- 不完整穿搭会按缺失衣层向模特图任务注入真实默认素材：浅石灰短款露脐运动背心、深灰高腰瑜伽短裤；平面图与细节图不使用补位素材
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
temp/            本地可再生构建产物与缓存（不入库）
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

## Windows 安装包

执行 `.\scripts\package.ps1` 后，安装版和便携版会生成在 `temp/build/release/`：

- `LongY Studio Setup 0.1.0.exe`（安装版，约 297 MB）
- `LongY Studio 0.1.0.exe`（便携版，约 297 MB）

发行包会内嵌 FastAPI sidecar、SQLite 迁移、品类/镜头/模特规则、MediaPipe QC 模型和前端资源。启动桌面程序时会隐藏启动 sidecar，健康检查通过后再显示工作台；运行数据写入当前 Windows 用户数据目录，关闭桌面程序时 sidecar 同步退出，不再要求用户安装 Python 或手工运行 `scripts/dev.ps1`。已生成的安装包属于可再生产物，不保存在 Git 仓库。

当前测试发行包尚未配置商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”；正式对外分发前仍需配置 Authenticode 证书并重新打包。

## 测试与构建

```powershell
.\scripts\check-code-quality.ps1 # 结构 / 命名 / JSON 规则 + 后端测试 + 前端构建
.\scripts\build.ps1              # 兼容入口，内部调用质量检查
.\scripts\package.ps1   # 构建 sidecar、安装版和便携版，并执行无窗口启动自检
```

如 Electron 官方运行时在当前网络下载超时，可在调用打包脚本前临时设置兼容镜像；下载文件仍由 Electron 的校验和验证。镜像设置不进入最终应用。

## 临时文件策略

所有下载源码、Codex skill、构建产物、缓存、测试数据和浏览器快照都放在 `temp/`。普通前端构建输出为 `temp/build/frontend`。

## 开源研究

见 `docs/open-source-research.md`。研究阶段曾临时下载：

- `temp/research/open-source/comfy-desktop`
- `temp/research/open-source/xyflow`
- `temp/archive/failed-langflow`（网络中断，未完整展开，已归档）

以上研究源码和临时技能不是产品运行依赖，清理后不再随工程保存。研究期还曾临时下载：

- `temp/skills/security-best-practices`
- `temp/skills/playwright`




## 历史资料整理

- 旧版 `Model/` 和 405 MB 的原始 `总览.xlsx` 已完成审计与迁移，不参与运行，不再保存在工程中。
- 可运行资产、问题图 SHA-256 清单、32 例固定评测集和提示词校准规则已迁移到 `asset-library/`。
- 原根目录 `template/` 参考图已移动到 `asset-library/reference-images/template/`；构建、缓存和研究下载均可从 `temp/` 重建。










