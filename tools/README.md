# Vendored OpenRouter ICU CLI

`openrouter_icu_image.py` is vendored here so LongY Studio does not depend on a
user-level Codex skills directory or a specific developer machine.

The backend resolves this copy first. A custom copy can still be selected with:

```powershell
$env:LONGY_OPENROUTER_ICU_CLI = "D:\path\to\openrouter_icu_image.py"
```

API keys are never committed. Configure the key through the in-app settings
dialog when packaged, or through `OPENROUTER_ICU_API_KEY` during development.
