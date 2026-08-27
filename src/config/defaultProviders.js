const Provider = require('../models/Provider');

const defaultProviders = [
  {
    name: 'openai',
    models: [
      // GPT-5.6 series (latest, Daybreak generation)
      'gpt-5.6-sol', // Flagship model for complex reasoning and agentic tasks (daybreak-blue-latest alias)
      'gpt-5.6-terra', // Balanced speed/intelligence tier
      'gpt-5.6-luna', // Fastest, most cost-efficient tier
      'gpt-5.6-cyber', // Specialized security/cyber-testing variant (daybreak-red-latest alias)

      // GPT-5.5 series
      'gpt-5.5', // Intelligent reasoning model for coding and agentic tasks
      'gpt-5.5-pro', // Version of GPT-5.5 that produces smarter and more precise responses
      'gpt-5.5-cyber', // Specialized security/cyber-testing variant

      // GPT-5.4 series
      'gpt-5.4',
      'gpt-5.4-mini', // Faster, cost-efficient version of GPT-5.4
      'gpt-5.4-nano', // Smallest, most cost-efficient version of GPT-5.4
      'gpt-5.4-pro', // Version of GPT-5.4 that produces smarter and more precise responses

      // GPT-5.3 series
      'gpt-5.3-codex', // Optimized for agentic coding in Codex

      // GPT-5.2 series
      'gpt-5.2', // Best model for coding and agentic tasks across industries
      'gpt-5.2-pro', // Version of GPT-5.2 that produces smarter and more precise responses

      // GPT-5.1 series
      'gpt-5.1',
      'gpt-5.1-pro', // Version of GPT-5.1 with enhanced capabilities

      // GPT-5 series (deprecated, shutdown Dec 11, 2026 — replacement: gpt-5.6-sol/terra/luna)
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-pro',

      // GPT-4.1 series
      'gpt-4.1', // Smartest non-reasoning model
      'gpt-4.1-mini', // Smaller, faster version of GPT-4.1
      'gpt-4.1-nano', // Deprecated, shutdown Oct 23, 2026 — replacement: gpt-5.6-luna

      // GPT-4o series
      'gpt-4o', // Fast, intelligent, flexible GPT model
      'gpt-4o-mini', // Fast, affordable small model for focused tasks

      // Legacy GPT-4 / GPT-3.5 (deprecated, shutdown Oct 23, 2026 — replacement: gpt-5.6-sol/terra)
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',

      // Reasoning models (O-series, deprecated — replacement: gpt-5.6-sol/terra)
      'o1', // Shutdown Oct 23, 2026
      'o1-pro', // Shutdown Oct 23, 2026
      'o3', // Shutdown Dec 11, 2026
      'o3-pro', // Shutdown Dec 11, 2026
      'o3-mini', // Shutdown Oct 23, 2026
      'o4-mini', // Shutdown Oct 23, 2026

      // Specialized models
      'gpt-5-search-api', // Optimized for web search
      'chat-latest', // GPT model tuned for ChatGPT-style conversation

      // Open-weight models (Apache 2.0 license)
      'gpt-oss-120b', // Most powerful open-weight model, fits into an H100 GPU
      'gpt-oss-20b', // Medium-sized open-weight model for low latency

      // Embedding models
      'text-embedding-3-large', // Latest large embedding model
      'text-embedding-3-small', // Latest small embedding model
      'text-embedding-ada-002', // Legacy embedding model

      // Legacy base models (deprecated, shutdown Sept 28, 2026 — replacement: gpt-5.6-terra)
      'davinci-002',
      'babbage-002',

      // Moderation models
      'omni-moderation-latest', // Identify potentially harmful content in text and images
    ],
  },
  {
    name: 'anthropic',
    models: [
      // Top-tier (latest)
      'claude-fable-5', // Top-tier flagship model
      'claude-mythos-5', // Limited availability research preview tier

      // Claude Opus 5
      'claude-opus-5', // Most intelligent model for complex agents & coding, 1M context

      // Claude Opus 4.x (active)
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-5-20251101',

      // Claude Sonnet 5
      'claude-sonnet-5', // Best speed/intelligence balance, 1M context

      // Claude Sonnet 4.x (active)
      'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250929',

      // Claude Haiku 4.5 (active)
      'claude-haiku-4-5-20251001', // Fastest, most affordable, 200k context
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
