// Small helpers shared by the graph steps.

// Hard cap on planner rounds per turn, independent of the tool-call budget.
const MAX_PLANNER_ROUNDS = 5;

// Generic progress labels for status events. Tool names are internal, so the
// client only learns what kind of work is happening.
const TOOL_STATUS = {
  rag_search: 'searching_knowledge_base',
  faq: 'searching_knowledge_base',
  web_search: 'searching_web',
  webpage_scraper: 'reading_webpage',
  api_caller: 'looking_up_data',
  google_calendar: 'checking_calendar',
  request_human_handoff: 'contacting_team',
};

function newUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0, cost: 0 };
}

/** Accumulate usage from an LLM response into a running total object. */
function accumulateUsage(total, usage) {
  if (!usage) {
    return;
  }
  total.prompt_tokens += usage.prompt_tokens || 0;
  total.completion_tokens += usage.completion_tokens || 0;
  total.total_tokens += usage.total_tokens || 0;
  total.cached_tokens += usage.cached_tokens || 0;
  total.cost += usage.cost || 0;
}

/**
 * Model for a graph step; falls back to the agent's main model.
 * @param {'planner'|'responder'|'critic'} role
 */
function getGraphModel(agent, role) {
  return agent.config?.graph_models?.[`${role}_model`] || agent.llm_settings.model;
}

function throwIfCancelled(cancellationToken) {
  if (cancellationToken?.cancelled) {
    const err = new Error('Execution cancelled — newer message received');
    err.code = 'EXECUTION_CANCELLED';
    throw err;
  }
}

/** Status emitter that never throws and skips repeats of the same stage. */
function createStatusEmitter(statusCallback) {
  let last = null;
  return stage => {
    if (!statusCallback || stage === last) {
      return;
    }
    last = stage;
    try {
      statusCallback({ stage });
    } catch (err) {
      console.warn('[Graph] status callback failed:', err.message);
    }
  };
}

function toolStatus(toolName) {
  return TOOL_STATUS[toolName] || 'working';
}

module.exports = {
  MAX_PLANNER_ROUNDS,
  newUsage,
  accumulateUsage,
  getGraphModel,
  throwIfCancelled,
  createStatusEmitter,
  toolStatus,
};
