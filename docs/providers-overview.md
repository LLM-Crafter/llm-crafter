# LLM Providers & Models

LLM Crafter supports 40+ models from leading AI providers. All models are pre-configured and ready to use once you add your API keys.

## OpenAI

**Get API Key:** [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### GPT-5 Series

- `gpt-5`
- `gpt-5-mini`
- `gpt-5-nano`
- `gpt-5-chat`

### Reasoning Models (O-Series)

- `o3-deep-research`
- `o3-pro`
- `o3`
- `o3-mini`
- `o4-mini-deep-research`
- `o4-mini`

### GPT-4.1 Series

- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`

### GPT-4 Series

- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

### Embedding Models

- `text-embedding-3-large`
- `text-embedding-3-small`
- `text-embedding-ada-002`
- `3-large-256`
- `3-large-1024`
- `3-small-512`

### Open-Weight Models

- `gpt-oss-120b`
- `gpt-oss-20b`

---

## Anthropic

**Get API Key:** [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

### Claude 4 Series

- `claude-opus-4-1-20250805` - Latest flagship model
- `claude-opus-4-20250514` - Original Claude 4
- `claude-sonnet-4-20250514` - Mainstream model

### Claude 3 Series

- `claude-3-7-sonnet-20250219`
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

---

## Google

**Get API Key:** [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)

### Gemini 2.x Series

- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.0-flash`

### Gemini 1.5 Series

- `gemini-1.5-pro` - Up to 2M token context
- `gemini-1.5-pro-exp-0801` - Experimental version
- `gemini-1.5-flash`
- `gemini-1.5-flash-8b` - Smallest Flash model

### Gemini 1.0 Series

- `gemini-1.0-pro`
- `gemini-1.0-pro-vision`
- `gemini-1.5-pro-vision`

---

## DeepSeek

**Get API Key:** [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

### Core Chat Models

- `DeepSeek-V3` - General-purpose, 64k context
- `DeepSeek-R1` - Reasoning-focused, 64k context

### Base Language Models

- `deepseek-llm-7b-base`
- `deepseek-llm-7b-chat`
- `deepseek-llm-67b-base`
- `deepseek-llm-67b-chat`

### Vision-Language Models

- `DeepSeek-VL` - Vision-language (1.3B)
- `DeepSeek-VL2` - Improved (1B-4.5B variants)

### Specialized Models

- `DeepSeek-Math` - Mathematical reasoning
- `DeepSeek-Prover` - Theorem prover for Lean 4
- `JanusFlow` - Multimodal with decoupled visual encoding
- `Janus-Pro` - Advanced multimodal generation
- `DeepSeek-R1-Distill-Qwen-32B` - Distilled reasoning model

---

## Quick Reference

| Provider  | Total Models | Context Length    | API Key Link                                           |
| --------- | ------------ | ----------------- | ------------------------------------------------------ |
| OpenAI    | 20 models    | Up to 2M tokens   | [Get Key](https://platform.openai.com/api-keys)        |
| Anthropic | 9 models     | Up to 200k tokens | [Get Key](https://console.anthropic.com/settings/keys) |
| Google    | 8 models     | Up to 2M tokens   | [Get Key](https://makersuite.google.com/app/apikey)    |
| DeepSeek  | 12 models    | Up to 64k tokens  | [Get Key](https://platform.deepseek.com/api_keys)      |

## Using Models in LLM Crafter

1. **Add API Keys**: Configure your provider API keys in the LLM Crafter UI or via the [API Keys endpoint](/api/api-keys)
2. **Create Agent**: Select any of the 40+ models when creating an agent
3. **Start Using**: Models are automatically available once API keys are configured

All providers are initialized automatically when the server starts. No additional configuration needed.
