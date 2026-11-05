// Skill selection for the small agent graph.
//
// A skill is a set of task instructions stored on the agent (agent.skills[]).
// Before the planner runs, a selector decides which skills fit this turn: Jev
// when configured, otherwise a small model from the agent's own provider. Active
// skills live on the conversation (skill_state) and are rendered into the prompts
// of every role, so they stay active across turns until they go unused.
//
// Skills are guidance only. They never grant a tool or authorize an action; use
// procedures for anything that must be enforced. A running procedure suspends them.

const jevService = require('../jevService');
const procedureService = require('../procedureService');
const prompts = require('./prompts');
const { SMALL_MODELS } = require('../../config/smallModels');
const { accumulateUsage } = require('./shared');

const DEFAULT_SETTINGS = {
  yes_threshold: 0.7,
  no_threshold: 0.3,
  max_active: 3,
  idle_turns: 6,
  idle_hours: 24,
};

const RECENT_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 2000;
// A ceiling that leaves room for models that reason by default.
const SELECTOR_MAX_TOKENS = 1000;

function getSettings(agent) {
  const configured = agent.config?.skill_selection || {};
  const settings = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    settings[key] = configured[key] ?? fallback;
  }
  return settings;
}

/** Selector model: per-agent override, then the provider's small model, then the main model. */
function getSelectorModel(agent) {
  const override = agent.config?.graph_models?.selector_model;
  if (override) {
    return override;
  }
  const provider = agent.api_key.provider;
  const small = SMALL_MODELS[provider.name];
  // A provider whose model list was changed may no longer offer the small model.
  if (small && (!provider.models || provider.models.includes(small))) {
    return small;
  }
  return agent.llm_settings.model;
}

function toTime(value) {
  return new Date(value).getTime();
}

/** Stored entries whose skill still exists and whose last use is recent enough. */
function loadActiveEntries(conversation, skills, settings, now) {
  const enabledIds = new Set(skills.map(skill => skill.id));
  const maxAgeMs = settings.idle_hours * 60 * 60 * 1000;
  return (conversation.skill_state?.active || [])
    .filter(entry => enabledIds.has(entry.skill_id) && now - toTime(entry.last_selected_at) <= maxAgeMs)
    .map(entry => ({
      skill_id: entry.skill_id,
      activated_at: entry.activated_at,
      last_selected_at: entry.last_selected_at,
      idle_turns: entry.idle_turns || 0,
    }));
}

/**
 * Work out the active set for this turn. `selectedIds` is ordered most relevant
 * first, or null when the selector failed: a failed selector must not drop
 * instructions in the middle of a flow, so the current set stays as it is.
 */
function nextActiveEntries(previous, selectedIds, settings, now) {
  if (selectedIds === null) {
    return previous.slice(0, settings.max_active);
  }

  const previousById = new Map(previous.map(entry => [entry.skill_id, entry]));
  const selected = selectedIds.map(id => ({
    skill_id: id,
    activated_at: previousById.get(id)?.activated_at || new Date(now),
    last_selected_at: new Date(now),
    idle_turns: 0,
  }));
  const carried = previous
    .filter(entry => !selectedIds.includes(entry.skill_id))
    .map(entry => ({ ...entry, idle_turns: entry.idle_turns + 1 }))
    .filter(entry => entry.idle_turns < settings.idle_turns)
    .sort((a, b) => toTime(b.last_selected_at) - toTime(a.last_selected_at));

  return [...selected, ...carried].slice(0, settings.max_active);
}

function formatRecentConversation(history) {
  return history
    .filter(msg => !msg.is_summarized && (msg.role === 'user' || msg.role === 'assistant'))
    .slice(-RECENT_MESSAGES)
    .map(msg => `${msg.role}: ${(msg.content || '').slice(0, MAX_MESSAGE_CHARS)}`)
    .join('\n');
}

const SELECTION_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'skill_selection',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        skill_ids: {
          type: 'array',
          description: 'IDs of the skills the latest message calls for, most relevant first. Empty when none apply.',
          items: { type: 'string' },
        },
        reasoning: { type: 'string' },
      },
      required: ['skill_ids'],
    },
  },
};

/** Ask an LLM which skills apply. Returns ordered ids, or null when every attempt failed. */
async function selectWithModel(ctx, skills) {
  const { agent, openai } = ctx;
  const catalogue = skills
    .map(skill => {
      const notFor = skill.not_for ? `\n  not for: ${skill.not_for}` : '';
      return `- id: ${skill.id}\n  when to use: ${skill.description}${notFor}`;
    })
    .join('\n');
  const systemPrompt = [
    'You choose which instruction sets an assistant needs for the customer\'s latest message.',
    'Match on meaning, not exact keywords. Choose every set that applies, or none if none apply.',
    'A short follow-up such as "yes" or an order number belongs to the topic it continues.',
    '',
    'Available instruction sets:',
    catalogue,
    '',
    'Respond with JSON only, in the exact shape: {"skill_ids": ["<id>"], "reasoning": "<why>"}',
    'Do not include any text before or after the JSON object.',
  ].join('\n');
  const userPrompt =
    `Recent conversation:\n${formatRecentConversation(ctx.context.conversation_history)}\n\n` +
    'Which instruction sets does the latest customer message call for?';

  const models = [...new Set([getSelectorModel(agent), agent.llm_settings.model])];
  const validIds = new Set(skills.map(skill => skill.id));

  for (const model of models) {
    try {
      // The agent's own parameters are left out because they may not suit a different model.
      const parameters = { temperature: 0, max_tokens: SELECTOR_MAX_TOKENS };
      const response = await openai.generateCompletion(
        model,
        userPrompt,
        parameters,
        systemPrompt,
        openai.supportsStructuredOutputs(model) ? SELECTION_SCHEMA : null,
        { prompt_cache_key: `agent_skill_selection_${agent._id}` }
      );
      accumulateUsage(ctx.usage, response.usage);

      const parsed = procedureService.parseJsonResponse(response.content);
      if (Array.isArray(parsed?.skill_ids)) {
        return { ids: [...new Set(parsed.skill_ids)].filter(id => validIds.has(id)), model };
      }
      console.warn(`[Graph Skills] Selector model ${model} returned unparseable output.`);
    } catch (error) {
      console.warn(`[Graph Skills] Selector model ${model} failed: ${error.message}`);
    }
  }
  return null;
}

/**
 * Decide which skills apply this turn.
 * @returns {Promise<{ids: string[]|null, reasoning: string}>} ids is null when selection failed
 */
async function selectSkills(ctx, skills, settings) {
  const { agent } = ctx;
  const nameOf = id => skills.find(skill => skill.id === id)?.name || id;
  let jevSummary = '';
  let clearIds = [];

  if (jevService.isEnabled(agent, 'skill_selection')) {
    const jev = await jevService.selectSkills(agent, {
      conversationHistory: ctx.context.conversation_history,
      skills,
    });
    if (jev) {
      accumulateUsage(ctx.usage, jev.usage);
      const scores = skills
        .map(skill => ({ skill, probability: jev.probabilities[skill.id] }))
        .sort((a, b) => b.probability - a.probability);
      jevSummary = `Jev (${jev.latency_ms}ms): ${scores.map(s => `${s.skill.name}=${s.probability.toFixed(2)}`).join(', ')}.`;

      clearIds = scores.filter(s => s.probability >= settings.yes_threshold).map(s => s.skill.id);
      const unclear = scores.filter(s => s.probability > settings.no_threshold && s.probability < settings.yes_threshold);
      if (unclear.length === 0) {
        return { ids: clearIds, reasoning: jevSummary };
      }
    }
  }

  // The model always judges every skill and has the final say. Shown only the unclear
  // ones, it tends to accept them because it can't see that another skill fits better.
  const selection = await selectWithModel(ctx, skills);
  const prefix = jevSummary ? `${jevSummary} ` : '';
  if (!selection) {
    // Jev's clear answers still stand. With none, the current skills are kept as they are.
    return {
      ids: clearIds.length > 0 ? clearIds : null,
      reasoning: `${prefix}Selector failed; ${clearIds.length > 0 ? 'using Jev\'s clear answers' : 'keeping the current skills'}.`,
    };
  }
  const chosen = selection.ids.map(nameOf).join(', ') || 'none';
  return { ids: selection.ids, reasoning: `${prefix}Model ${selection.model} chose: ${chosen}.` };
}

/**
 * Work out this turn's active skills and expose them to the graph as
 * ctx.activeSkills and ctx.context.skills_directive. Agents with no enabled
 * skills are untouched. Never throws: a turn runs without skills rather than fail.
 */
async function activateSkills(ctx) {
  const { agent, conversation } = ctx;
  ctx.activeSkills = [];

  try {
    const skills = (agent.skills || []).filter(skill => skill.enabled !== false);
    if (skills.length === 0) {
      return;
    }

    if (conversation.procedure_state?.status === 'active') {
      ctx.thinking.push({ step: 'skills_suspended', reasoning: 'A procedure is running, so skills are suspended.' });
      return;
    }

    ctx.emitStatus('planning');

    const settings = getSettings(agent);
    const now = Date.now();
    const previous = loadActiveEntries(conversation, skills, settings, now);
    const { ids, reasoning } = await selectSkills(ctx, skills, settings);
    const active = nextActiveEntries(previous, ids, settings, now);

    conversation.skill_state = { active };

    // Oldest activation first, so a skill keeps its place in the prompt while it stays active.
    ctx.activeSkills = [...active]
      .sort((a, b) => toTime(a.activated_at) - toTime(b.activated_at) || a.skill_id.localeCompare(b.skill_id))
      .map(entry => skills.find(skill => skill.id === entry.skill_id));
    ctx.context.skills_directive = prompts.formatSkillsDirective(ctx.activeSkills);

    const names = ctx.activeSkills.map(skill => skill.name).join(', ') || 'none';
    ctx.thinking.push({ step: 'skill_selection', reasoning: `${reasoning} Active skills: ${names}.` });
    console.log(`[Graph Skills] Active: ${names}`);
  } catch (error) {
    console.warn(`[Graph Skills] Skill selection failed: ${error.message}`);
    ctx.activeSkills = [];
    ctx.thinking.push({ step: 'skill_selection', reasoning: `Skill selection failed (${error.message}). Continuing without skills.` });
  }
}

module.exports = { activateSkills, getSelectorModel, nextActiveEntries, DEFAULT_SETTINGS, SMALL_MODELS };
