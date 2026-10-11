# 套图模板库（shot-templates）

本目录存放按品类划分的电商套图镜头清单（Shot List）。任务规划器读取这里的 JSON，把一个商品自动展开成完整的多图任务，导出前做完整性校验。

当前已覆盖全部 33 个品类（与 asset-library/categories/all.json 一一对应）：

- 上装（9）：top、inner、coat、vest、shirt、tshirt、hoodie、sweater、blazer
- 下装（6）：pants、skirt、shorts、jeans、halfSkirt、dress
- 鞋履（5）：shoes、boots、heels、sneakers、slippers
- 配饰（9）：hat、belt、scarf、earring、necklace、bracelet、watch、sunglasses、ring
- 包袋（4）：handbag、backpack、crossbody、wallet

## 文件规则

- 一个品类一个文件，文件名 = 品类ID.json，与 asset-library/categories/ 的 ID 一致
- 新增品类时复制最接近的模板修改，version 从 1.0.0 起步
- 修改任何模板后提升 version 并更新 updatedAt

## 结构说明

- schema：模板协议版本，当前 longy.shot-template.v1
- category / categoryName / group：对应品类库中的 ID、中文名、分组
- attributes：该品类可勾选的商品属性（布尔值），驱动条件镜头
- defaults.outputByType：四类图的默认输出尺寸（flat/partial/detail/model）
- shots：固定镜头，按图类型分组，是任务规划的基础清单
- conditionalShots：满足 when 条件时追加的镜头（如有帽才拍帽型特写）
- detailPageModules：详情页模块建议，generate=true 的走AI生图，false 的用设计模板
- platformPresets：各电商平台选图组合建议（如淘宝主图5张）

## 镜头字段

- id：稳定英文标识，任务引用与导出校验都靠它
- name：中文名称
- type：flat（平面图）/ partial（展示图）/ detail（细节图）/ model（模特上身图）
- required：是否必出；生成规则为 priority=P0 时 required=true，导出前校验缺图
- priority：P0 必出核心 / P1 推荐补充（不阻塞导出）/ P2 加分项，草稿与快检方案按优先级裁剪
- promptHints：追加到品类基础提示词后的镜头级描述
- references：所需参考图角色，garment=商品原图，model-identity=定稿模特，style=风格参考
- platformUse：建议用途（如主图第1张）

## 与现有系统的关系

- 品类基本信息仍在 categories/*.json，本模板是它的下游扩展
- 生成数量裁剪逻辑对应 generation-presets/*.json（如只取 P0 = 快速检查方案）
- 提示词主干沿用 prompt-templates/legacy-v2.json，本模板的 promptHints 是镜头级增量

## 维护约定

- 人工补图后若发现模板缺失某镜头，同步补进对应品类 JSON 并提升 version
- 条件镜头新增时，先在 attributes 里声明对应属性再引用
- 修改后运行后端测试确认 JSON 可解析