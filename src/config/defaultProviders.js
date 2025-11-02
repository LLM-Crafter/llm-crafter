const Provider = require('../models/Provider');

const defaultProviders = [
  {
    name: 'openai',
    models: [
      // GPT-5 series (latest)
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-pro',
      'gpt-5-chat',

      // GPT-4.1 series
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',

      // GPT-4o and related
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'o4-mini',
      'o4-mini-deep-research',

      // Reasoning & research (O-series)
      'o3-deep-research',
      'o3-pro',
      'o3',
      'o3-mini',

      // GPT-4 and 3.5 legacy
      'gpt-4',
      'gpt-3.5-turbo',

      // Embedding models
      'text-embedding-3-large',
      'text-embedding-3-small',
      'text-embedding-ada-002',
      '3-large-256',
      '3-large-1024',
      '3-small-512',

      // Open-weight models
      'gpt-oss-120b',
      'gpt-oss-20b',
    ],
  },
  {
    name: 'anthropic',
    models: [
      // Claude 4.x mainline (latest)
      'claude-opus-4-1-20250805', // Claude Opus 4.1 (current top-tier model)
      'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 (mainstream, best balance)
      'claude-sonnet-4-5-long', // Claude Sonnet 4.5 (long context, >200K tokens)
      'claude-haiku-4-5-20251001', // Claude Haiku 4.5 (fastest, most affordable)

      // Claude 4.x legacy
      'claude-opus-4-20250514', // Claude Opus 4 (original Claude 4 release)
      'claude-sonnet-4-20250514', // Claude Sonnet 4 (legacy)

      // Claude 3.7 and 3.5 (legacy/active for select uses)
      'claude-3-7-sonnet-20250219', // Claude 3.7 Sonnet (hybrid model; still deployed)
      'claude-3-5-sonnet-20241022', // Claude 3.5 Sonnet (rapid reasoning/coding)
      'claude-3-5-haiku-20241022', // Claude 3.5 Haiku (fastest, most affordable)

      // Claude 3 baseline (still available in some API/cloud endpoints)
      'claude-3-opus-20240229', // Claude 3 Opus (now deprecated)
      'claude-3-sonnet-20240229', // Claude 3 Sonnet (now deprecated)
      'claude-3-haiku-20240307', // Claude 3 Haiku (fast/low-cost; vision + text)
    ],
  },
  {
    name: 'google',
    models: [
      // Gemini 2.x (active models, not in user’s sample but included for completeness)
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',

      // Gemini 1.5 series
      'gemini-1.5-pro', // Flagship, released Feb 2024, 1M-2M token context window
      'gemini-1.5-pro-exp-0801', // Experimental 1.5 Pro version (Aug 2024)
      'gemini-1.5-flash', // Lightweight, high-speed, released May 2024
      'gemini-1.5-flash-8b', // Smallest production Flash model (Oct 2024)

      // Gemini 1.0 series (legacy)
      'gemini-1.0-pro', // Main general model, released Dec 2023, now retired

      // Gemini Vision models (if you need them)
      'gemini-1.0-pro-vision', // Vision model for multimodal input (retired/legacy)
      'gemini-1.5-pro-vision', // 1.5 Pro vision model (active)
    ],
  },
  {
    name: 'deepseek',
    models: [
      // Core chat models
      'DeepSeek-V3', // General-purpose default chat model, MoE architecture, optimized for coding, summarization, and reasoning with 64k token context
      'DeepSeek-R1', // Reasoning-focused model, specialized in chain-of-thought, planning, math, and formal logic, supports 64k token context

      // Base Large Language Models (LLMs)
      'deepseek-llm-7b-base', // 7 billion parameter base model, multi-head attention, trained on 2 trillion tokens (English + Chinese)
      'deepseek-llm-7b-chat', // 7 billion parameter chat-tuned variant
      'deepseek-llm-67b-base', // 67 billion parameter base model, Grouped-Query Attention, trained on 2 trillion tokens
      'deepseek-llm-67b-chat', // 67 billion parameter chat-tuned variant

      // Vision-Language (Multimodal) models
      'DeepSeek-VL', // Vision-language model built on 1.3B base, trained on text and vision-language tokens
      'DeepSeek-VL2', // Improved performance and efficiency, variants include VL2-Tiny and VL2-Small (1B to 4.5B parameters)

      // Specialized models
      'DeepSeek-Math', // Specialized for complex mathematical reasoning and code, built on coder base 7B
      'DeepSeek-Prover', // Open-source automated theorem prover for Lean 4, advanced formal mathematical proof model

      // Other notable variants
      'DeepSeek-R1-Distill-Qwen-32B', // Distilled version of R1 model with competitive reasoning and code performance
      'JanusFlow', // Multimodal model with decoupled visual encoding for understanding and generation
      'Janus-Pro', // Advanced multimodal generation model in the Janus series
    ],
  },
  {
    name: 'xai',
    models: [
      // Grok 4 series (latest - July 2025)
      'grok-4', // Flagship model with 256k context, advanced reasoning, coding, and vision
      'grok-4-fast-reasoning', // Cost-efficient with 2M context, released September 2025
      'grok-4-fast-non-reasoning', // Fast variant with 2M context

      // Specialized coding model
      'grok-code-fast-1', // Lightning-fast reasoning model for agentic coding, 256k context, released August 2025

      // Grok 3 series (February 2025)
      'grok-3', // Flagship model with superior reasoning, 132k context
      'grok-3-mini', // Lightweight model excelling at math and reasoning, 132k context

      // Image generation
      'grok-2-image-1212', // Latest image generation model (Aurora), December 2024

      // Grok 2 series (August 2024)
      'grok-2',
      'grok-2-1212', // December 2024 release with improved multilingual support
      'grok-2-mini',

      // Grok 1.5 series (March-April 2024)
      'grok-1.5', // 128k context
      'grok-1.5-vision', // First multimodal model

      // Grok 1 series (legacy)
      'grok-1', // 314B parameter MoE model (open-sourced March 2024)

      // Beta/experimental models
      'grok-beta',
      'grok-vision-beta',
    ],
  },
];

async function initializeDefaultProviders() {
  console.log('Initializing default providers...');

  for (const providerData of defaultProviders) {
    try {
      // Check if provider already exists
      const existingProvider = await Provider.findOne({
        name: providerData.name,
      });

      if (existingProvider) {
        // Update existing provider with new models if any
        const newModels = providerData.models.filter(
          model => !existingProvider.models.includes(model)
        );

        if (newModels.length > 0) {
          existingProvider.models = [
            ...new Set([...existingProvider.models, ...newModels]),
          ];
          await existingProvider.save();
          console.log(
            `Updated provider: ${providerData.name} with ${newModels.length} new models`
          );
        } else {
          console.log(`Provider ${providerData.name} is up to date`);
        }
      } else {
        // Create new provider
        const provider = new Provider(providerData);
        await provider.save();
        console.log(
          `Created provider: ${providerData.name} with ${providerData.models.length} models`
        );
      }
    } catch (error) {
      console.error(
        `Error initializing provider ${providerData.name}:`,
        error.message
      );
    }
  }

  console.log('Default providers initialization completed');
}

async function refreshDefaultProviders() {
  console.log('Refreshing default providers with latest models...');

  // Force re-initialization of all default providers
  for (const providerData of defaultProviders) {
    try {
      await Provider.findOneAndUpdate(
        { name: providerData.name },
        {
          models: providerData.models,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      console.log(`Refreshed provider: ${providerData.name}`);
    } catch (error) {
      console.error(
        `Error refreshing provider ${providerData.name}:`,
        error.message
      );
    }
  }

  console.log('Default providers refresh completed');
}

module.exports = {
  initializeDefaultProviders,
  refreshDefaultProviders,
  defaultProviders,
};
