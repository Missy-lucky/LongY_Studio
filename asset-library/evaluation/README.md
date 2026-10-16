# 固定服饰评测集

`garment-authenticity-v1.json` 固定 32 个工作簿证据样本：16 个合格参考、16 个问题输出。
每个样本锁定工作表单元格、XLSX 媒体部件和 SHA-256，避免素材被替换后仍误认为同一基准。

运行以下命令验证工作簿、清单和哈希仍一致：

```powershell
.\backend\.venv\Scripts\python.exe scripts\build_garment_eval_set.py --check
```

评测集用于回归验证，不会自动把问题样本加入正向提示词或参考图库。颜色和轮廓可给出自动证据；Logo、文字和扣件数量仍必须人工确认。
