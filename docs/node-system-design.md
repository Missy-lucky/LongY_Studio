# 节点系统设计文档

> 版本：v1.0 | 日期：2026-10-11 | 状态：已确认

## 概述

节点系统替代原有的固定四类 Tab 布局，用户通过拖拽式节点画布完成素材上传、任务规划、生成审核的完整流程。

## 一、节点类型

### 1.1 输入节点（InputNode）

| 属性 | 类型 | 说明 |
|---|---|---|
| categoryId | string | 预设类型 ID（如 'top'） |
| categoryName | string | 显示名（如 '上衣'） |
| categoryGroup | string | 大类（如 '上装'） |
| image | UploadedImage \| null | 上传的素材图，null 为空白 |
| status | 'empty' \| 'uploaded' \| 'confirmed' | 节点状态 |

**行为：**
- 每个节点代表一个穿搭部位，通常只放一张素材图
- 用户可增删、可拖拽、可替换图片、可修改类型
- 空白节点不影响生成，程序自动跳过
- 点击图片区域触发文件上传

### 1.2 模特风格节点（ModelNode）

| 属性 | 类型 | 说明 |
|---|---|---|
| styleId | string | 风格 ID |
| styleName | string | 显示名（如 '通勤简约'） |
| styleGroup | string | 分类（如 '通勤'） |
| locked | boolean | 用户是否已确认 |

**行为：**
- 系统内置模特库，用户不需要上传
- 选择风格后自动出现，不需要手动连线
- 可更换、可预览

### 1.3 处理节点（ProcessingNode）

| 属性 | 类型 | 说明 |
|---|---|---|
| processType | 'flat' \| 'detail' \| 'partial' \| 'model' | 处理类型 |
| status | 'idle' \| 'planned' \| 'running' \| 'done' \| 'failed' | 状态 |
| estimatedCount | number | 预计生成张数 |
| estimatedCost | number | 预计成本 |

**四种处理节点：**
1. **平面图生成**：输入各单品素材 → 输出正反面平面图
2. **细节图生成**：输入售卖素材 → 输出细节展示图
3. **局部图生成**：输入售卖素材 → 输出局部大面积图
4. **模特图生成**：输入素材 + 模特风格 → 输出搭配模特图

### 1.4 输出节点（OutputNode）

| 属性 | 类型 | 说明 |
|---|---|---|
| taskCode | string | 任务编号 |
| taskName | string | 任务名 |
| imageType | ProcessType | 图片类型 |
| status | OutputStatus | 状态 |
| version | number | 版本号 |
| parentOutputId | string \| null | 重生成时指向上一版本 |

**状态流转：**
```
queued → generating → pending → satisfied（满意锁定）
                              → unsatisfied → regenerate → 新 output（v+1）
```

## 二、连线规则

| 连线类型 | 颜色 | 允许的连接 |
|---|---|---|
| material（素材线） | #3B82F6 | 输入节点 → 处理节点 |
| model（模特线） | #8B5CF6 | 模特节点 → 模特图处理节点 |
| output（生成线） | #6366F1 | 处理节点 → 输出节点 |
| regen（重生成线） | #F59E0B | 不满意输出 → 新处理节点 |

**约束：**
- 输入节点可连多个处理节点
- 模特节点只能连模特图处理节点
- 处理节点不能互相连接
- 输出节点不能连输入节点

## 三、状态机

### 输入节点
```
empty --上传图片--> uploaded --自动确认--> confirmed
  ↑                                         |
  └-----------删除图片------------------------┘
```

### 处理节点
```
idle --生成方案--> planned --开始生成--> running --完成--> done
                                          |
                                        failed --重试--> running
```

### 输出节点（审核循环）
```
queued → generating → pending
                         ├──满意──→ satisfied（绿色锁定）
                         └──不满意──→ unsatisfied ──重生成──→ 新output(v+1)
```

## 四、预设类型列表（28 个）

### 上装（9 个）
上衣、内搭、外套、马甲、衬衫、T恤、卫衣、毛衣、西装

### 下装（6 个）
裤子、裙子、短裤、牛仔裤、半身裙、连衣裙

### 鞋履（5 个）
鞋子、靴子、高跟鞋、运动鞋、拖鞋

### 配饰（9 个）
帽子、腰带、围巾、耳环、项链、手链、手表、墨镜、戒指

### 包袋（4 个）
手提包、背包、斜挎包、钱包

### 其他
用户可自定义（输入名称即可）

### 模特风格（6 种）
| 分类 | 风格 |
|---|---|
| 通勤 | 通勤简约、优雅通勤 |
| 休闲 | 休闲街头、甜美可爱 |
| 运动 | 运动活力、户外机能 |

## 五、输入节点增删逻辑

### 添加流程
1. 点击画布左上角 **[+ 添加部位]** 按钮
2. 弹出类型选择器（底部弹出，带搜索）
3. 按大类分组展示 28 个预设类型
4. 点击类型 → 画布上出现新节点
5. 自动连线到所有已存在的处理节点

### 删除流程
1. 悬停节点 → 右上角出现删除按钮
2. 或右键菜单 → 删除节点
3. 确认后：删除节点 + 删除所有关联连线

### 替换图片
1. 点击已有图片
2. 或悬停 → 点击替换按钮
3. 文件选择器 → 选择新图 → 自动更新

### 修改类型
1. 点击节点类型名称（蓝色）
2. 弹出类型选择器
3. 选择新类型 → 更新节点分类

## 六、代码结构

```
frontend/src/
├── types/node-system.ts          # 类型定义
├── data/preset-categories.ts     # 28 个预设类型 + 模特风格
├── stores/node-store.ts          # 节点状态管理
└── components/nodes/
    ├── NodeComponents.tsx        # 4 种节点组件
    ├── TypePicker.tsx            # 类型选择器 + 模特选择器
    └── NodeCanvas.tsx            # React Flow 画布
```
