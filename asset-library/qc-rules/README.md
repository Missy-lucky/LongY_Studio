# 参考图质量规则

`reference-workbook.json` 是从原始 `总览.xlsx` 只读生成的审计清单，不复制原始大图。原工作簿与旧 `Model/` 历史库已完成迁移并从仓库工作区删除；运行时只读取本清单中的分类、指针与 SHA-256。

分类规则：

- `approved_reference`：工作簿“示例图”工作表中的正向参考。
- `rejected_output`：工作簿“AI有问题的”工作表 C 列中的生成结果。
- `defect_evidence`：同一工作表 D 列中的红框缺陷证据。
- `source_context`：问题表中的原始商品素材，只用于对照，不代表坏图。
- `unfinished_source`：工作簿“未做完的图”工作表中的待处理素材，不作为正向参考。

清单中的 `matchedLibraryFiles` 只在离线构建时通过感知哈希建立候选对应关系；运行时拦截只使用已写入清单的精确 SHA-256，避免用模糊相似度误伤正常商品图。

重新生成：

```powershell
python scripts/build_reference_qc_manifest.py --match-libraries
```

工作簿结构变更后应先人工确认列语义，再更新脚本中的分类规则。
