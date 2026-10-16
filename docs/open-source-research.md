# 开源项目源码研究记录

研究时间：2026-10-11  
研究时的临时位置：`temp/research/open-source/` 与 `temp/archive/failed-langflow/`（调研完成后已清理，不进入正式源码目录）

## 研究对象

| 项目 | 研究目的 | 对本项目的采纳 |
|---|---|---|
| Comfy-Org/desktop | Windows 桌面端如何管理本地 Python 服务、日志、进程生命周期和资源目录 | 已采用“桌面壳 + 本地 sidecar + 独立 storage”的模式；Electron 壳只负责窗口和进程，不在 UI 中写业务 |
| xyflow/xyflow | React Flow 自定义节点、拖拽、小地图、边渲染和受控状态更新 | 保持 `@xyflow/react` 作为流程画布；节点类型、连线类型和小地图集中在 `frontend/src/components/nodes` |
| langflow-ai/langflow | 节点工作流与 Python 后端的组织方式 | 网络不稳定导致 sparse checkout 未完整展开；已移动到 `temp/archive/failed-langflow/`，未直接复制代码 |

## Comfy Desktop 的关键启发

源码参考：

- `src/main-process/comfyServer.ts`
- `src/infrastructure/structuredLogging.ts`
- `src/virtualEnvironment.ts`

可复用设计：

1. **服务生命周期显式建模**：启动中、运行中、启动超时、退出码、停止超时都作为状态处理，不把进程错误直接暴露成一个笼统异常。
2. **健康检查轮询**：启动本地服务后持续请求健康端点，就绪后才允许 UI 进入可用状态。
3. **stdout/stderr 分流**：stdout 用于生命周期事件，stderr 进入错误诊断；两者均写入日志。
4. **结构化日志**：对象、Error、Date 转成单行可读文本，方便本地排查。
5. **运行数据与程序资源分离**：输入、输出、数据库和日志均有独立目录，避免混入安装目录。

本项目落点：

- `desktop/` 只做桌面壳。
- `backend/app/queue/` 做任务生命周期。
- `backend/app/providers/` 做 Provider 生命周期。
- `storage/` 保存数据库、素材、缓存、日志和导出。
- `desktop/electron/main.cjs` 已实现 FastAPI sidecar 隐藏拉起、身份化健康检查、启动超时、日志落盘和退出回收。

## React Flow 的关键启发

源码参考：

- `examples/react/src/examples/CustomNode/index.tsx`
- `examples/react/src/examples/DragNDrop/index.tsx`
- `examples/react/src/examples/Edges/CustomEdge.tsx`
- `examples/react/src/examples/EdgeToolbar/index.tsx`

可复用设计：

1. **nodeTypes / edgeTypes 注册表**：自定义渲染与数据结构解耦。
2. **screenToFlowPosition**：处理外部拖拽落点，避免错误坐标。
3. **受控 nodes/edges**：由 Zustand 保存业务状态，React Flow 只负责交互。
4. **snapGrid**：画布使用 16px 网格，降低布局混乱。
5. **MiniMap 自定义颜色**：通过节点类型和状态映射颜色。
6. **自定义 Edge**：后续可在连线上显示缓存、成本、错误或数据依赖。

本项目落点：

- 不允许用户在 v0.1 随意连线生成非法流程。
- 连线语义固定为素材依赖、规范影响、生成输出、审核反馈、重生成版本。
- 画布节点必须来自真实任务状态，不做纯装饰动画。

## 下载的 Codex Skill

按“额外资料只进 temp”的原则，以下技能已下载到 `temp/skills/`，未安装到全局目录：

- `security-best-practices`：后续做 API Key、文件路径、上传、导出和本地服务的安全审查。
- `playwright`：后续做真实浏览器 UI 流程验证、快照和截图回归。

## 清理策略

- 开源源码、技能、构建产物、测试数据、浏览器快照、Python 缓存、npm 缓存均位于 `temp/`。
- `temp/research/` 和 `temp/skills/` 保留，便于复查来源。
- `temp/build/`、`temp/cache/`、`temp/tests/` 可随时删除后重建。

