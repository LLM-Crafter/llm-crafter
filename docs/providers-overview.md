# Default Providers Overview

## Supported Providers and Models

LLM Crafter comes with comprehensive support for major AI providers, automatically configured with the latest and most capable models.

### 🚀 OpenAI - Complete Model Suite

#### Next-Generation Models

- **GPT-5 Series**: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-chat`
  - Latest generation general-purpose models
  - Enhanced reasoning and multimodal capabilities

#### Advanced Reasoning (O-Series)

- **O3 Series**: `o3-deep-research`, `o3-pro`, `o3`, `o3-mini`
- **O4 Series**: `o4-mini-deep-research`, `o4-mini`
- Specialized for complex reasoning, research, and analytical tasks

#### GPT-4.1 Enhanced Series

- **Core Models**: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- Improved efficiency and performance over GPT-4

#### Production-Ready Models

- **GPT-4o**: `gpt-4o`, `gpt-4o-mini` (optimized variants)
- **GPT-4**: `gpt-4-turbo`, `gpt-4` (legacy flagship)
- **GPT-3.5**: `gpt-3.5-turbo` (cost-effective option)

#### Specialized Models

- **Embeddings**: `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`
- **Variants**: `3-large-256`, `3-large-1024`, `3-small-512`
- **Open-Weight**: `gpt-oss-120b`, `gpt-oss-20b`

### 🧠 Anthropic - Claude Advanced Series

#### Claude 4.x Generation

- **Claude Opus 4.1**: `claude-opus-4-1-20250805` (Current flagship)
- **Claude Opus 4**: `claude-opus-4-20250514` (Original Claude 4)
- **Claude Sonnet 4**: `claude-sonnet-4-20250514` (Mainstream model)

#### Claude 3.x Active Models

- **Claude 3.7**: `claude-3-7-sonnet-20250219` (Hybrid model)
- **Claude 3.5**: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`

#### Legacy Support

- **Claude 3**: `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`
- Full vision and text capabilities

### 🌟 Google - Gemini Ecosystem

#### Gemini 2.x (Latest)

- **Gemini 2.5**: `gemini-2.5-pro`, `gemini-2.5-flash`
- **Gemini 2.0**: `gemini-2.0-flash`

#### Gemini 1.5 (Production)

- **Gemini 1.5 Pro**: `gemini-1.5-pro` (1M-2M token context)
- **Experimental**: `gemini-1.5-pro-exp-0801`
- **Flash Series**: `gemini-1.5-flash`, `gemini-1.5-flash-8b`

#### Vision & Legacy

- **Vision Models**: `gemini-1.5-pro-vision`, `gemini-1.0-pro-vision`
- **Legacy**: `gemini-1.0-pro`

### 🔬 DeepSeek - Specialized AI Models

#### Core Chat Models

- **DeepSeek-V3**: General-purpose MoE architecture (64k context)
- **DeepSeek-R1**: Reasoning-focused with chain-of-thought (64k context)

#### Base Language Models

- **7B Series**: `deepseek-llm-7b-base`, `deepseek-llm-7b-chat`
- **67B Series**: `deepseek-llm-67b-base`, `deepseek-llm-67b-chat`
- Trained on 2 trillion tokens (English + Chinese)

#### Vision-Language (Multimodal)

- **DeepSeek-VL**: Vision-language model (1.3B base)
- **DeepSeek-VL2**: Improved efficiency, variants from 1B to 4.5B parameters

#### Specialized Models

- **DeepSeek-Math**: Mathematical reasoning and code (7B base)
- **DeepSeek-Prover**: Automated theorem prover for Lean 4
- **JanusFlow**: Multimodal with decoupled visual encoding
- **Janus-Pro**: Advanced multimodal generation

#### Advanced Variants

- **DeepSeek-R1-Distill-Qwen-32B**: Distilled reasoning model
- Competitive reasoning and code performance

## Model Selection Guide

### For General Chat & Content

- **GPT-5** series for cutting-edge capabilities
- **Claude Opus 4.1** for nuanced reasoning
- **Gemini 2.5 Pro** for multimodal tasks

### For Reasoning & Analysis

- **O3-series** (OpenAI) for deep research
- **DeepSeek-R1** for chain-of-thought reasoning
- **Claude Sonnet 4** for balanced reasoning

### For Cost-Effective Solutions

- **GPT-4.1-mini** or **GPT-4o-mini**
- **Claude 3.5 Haiku**
- **Gemini 1.5 Flash-8B**

### For Specialized Tasks

- **DeepSeek-Math** for mathematical problems
- **DeepSeek-VL2** for vision-language tasks
- **Text-embedding-3-large** for embeddings

### For Development & Coding

- **GPT-4.1** or **Claude 3.5 Sonnet**
- **DeepSeek-V3** for coding assistance
- **O3-mini** for code reasoning

## Model Capabilities

| Provider  | Models     | Context Length    | Specialties                              |
| --------- | ---------- | ----------------- | ---------------------------------------- |
| OpenAI    | 15+ models | Up to 2M tokens   | General purpose, reasoning, embeddings   |
| Anthropic | 9 models   | Up to 200k tokens | Reasoning, safety, nuanced understanding |
| Google    | 8 models   | Up to 2M tokens   | Multimodal, vision, research             |
| DeepSeek  | 12+ models | Up to 64k tokens  | Math, coding, vision, reasoning          |

## Getting Started

All providers are automatically configured when you start the application. Simply:

1. Start your LLM Crafter instance
2. Create an agent and select from 40+ available models
3. Configure API keys for the providers you want to use
4. Start building with state-of-the-art AI capabilities

## Updates & Maintenance

The provider list is regularly updated to include:

- Latest model releases
- Performance improvements
- New provider integrations
- Deprecated model removals

Use the refresh endpoint to update your models without restarting:

```bash
POST /api/v1/providers/refresh
```
