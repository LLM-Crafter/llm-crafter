# Default Providers Migration Guide

## Overview

The LLM Crafter project has been updated to include default providers and models that are automatically initialized when the application starts. This eliminates the need for manual provider setup and ensures users have immediate access to popular LLM services.

## What Changed

### Before

- Users had to manually create providers after installation
- No default models were available
- Empty provider list on first startup

### After

- 6 major LLM providers are automatically configured
- 30+ popular models are immediately available
- Providers are kept up-to-date with latest models

## Default Providers Included

1. **OpenAI**

   - **GPT-5 Series**: GPT-5, GPT-5-mini, GPT-5-nano, GPT-5-chat
   - **O-Series (Reasoning)**: o3-deep-research, o3-pro, o3, o3-mini, o4-mini-deep-research, o4-mini
   - **GPT-4.1 Series**: GPT-4.1, GPT-4.1-mini, GPT-4.1-nano
   - **GPT-4o & Legacy**: GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-4, GPT-3.5-turbo
   - **Embeddings**: text-embedding-3-large/small, ada-002, specialized variants
   - **Open-weight**: GPT-OSS-120B, GPT-OSS-20B

2. **Anthropic**

   - **Claude 4.x**: Claude Opus 4.1, Claude Opus 4, Claude Sonnet 4
   - **Claude 3.7**: Claude 3.7 Sonnet (hybrid model)
   - **Claude 3.5**: Claude 3.5 Sonnet, Claude 3.5 Haiku
   - **Claude 3 Legacy**: Claude 3 Opus, Sonnet, Haiku (vision + text)

3. **Google**

   - **Gemini 2.x**: Gemini 2.5 Pro/Flash, Gemini 2.0 Flash
   - **Gemini 1.5**: Gemini 1.5 Pro (1M-2M token context), Flash, Flash-8B
   - **Gemini 1.0**: Gemini 1.0 Pro (legacy)
   - **Vision Models**: Gemini Pro Vision variants

4. **DeepSeek** _(New Provider)_
   - **Core Chat**: DeepSeek-V3 (MoE architecture), DeepSeek-R1 (reasoning-focused)
   - **Base LLMs**: 7B and 67B parameter base and chat models
   - **Vision-Language**: DeepSeek-VL, DeepSeek-VL2 (multimodal)
   - **Specialized**: DeepSeek-Math, DeepSeek-Prover (theorem proving)
   - **Advanced**: DeepSeek-R1-Distill, JanusFlow, Janus-Pro

## For Existing Installations

### Automatic Update

When you restart your application, the default providers will be automatically added to your database. Your existing custom providers will remain unchanged.

### Manual Refresh

If you want to update providers with the latest models, use the refresh endpoint:

```bash
curl -X POST http://localhost:3000/api/v1/providers/refresh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### New API Endpoints

The following new endpoints are now available:

- `GET /api/v1/providers` - List all providers
- `GET /api/v1/providers/{id}` - Get specific provider
- `GET /api/v1/providers/{id}/models` - Get provider models
- `POST /api/v1/providers/refresh` - Refresh default providers (admin)

## Backward Compatibility

- All existing provider management endpoints continue to work
- Custom providers are preserved during updates
- Existing authentication and authorization requirements unchanged

## Configuration

The default providers are defined in `src/config/defaultProviders.js`. You can:

- Modify the default models list
- Add new providers to the defaults
- Remove providers you don't want

## Environment Variables

No additional environment variables are required. The default providers will be created with the standard configuration. You'll still need to configure API keys for the providers you want to use.

## Benefits

1. **Faster Setup**: No manual provider configuration needed
2. **Always Updated**: Latest models are included in updates
3. **Comprehensive**: Major LLM providers included out-of-the-box
4. **Flexible**: Can still add custom providers as needed

## Need Help?

If you encounter any issues with the default providers:

1. Check the application logs for initialization messages
2. Verify database connectivity
3. Use the refresh endpoint to update providers
4. Review the provider documentation in `docs/api/providers.md`
