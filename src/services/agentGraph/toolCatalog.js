// Native tool definitions for the graph planner.
//
// Every agent tool becomes one function with its JSON schema. api_caller is
// not exposed directly: each configured endpoint becomes its own function
// (e.g. "get_order") so the model sees a real schema per endpoint instead of
// a generic endpoint_name string. resolve() maps a call back to the tool
// invocation toolService expects.

const { systemTools: systemToolDefinitions } = require('../../config/systemTools');

// Function names both OpenAI and Anthropic accept.
const FUNCTION_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const BODY_METHODS = ['POST', 'PUT', 'PATCH'];

function sanitizeName(name) {
  return (name || 'endpoint').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

function toolSchema(tool) {
  const definition = systemToolDefinitions.find(st => st.name === tool.name);
  const schema = definition?.parameters_schema;
  if (!schema || schema.type !== 'object') {
    return { type: 'object', properties: {} };
  }
  return schema;
}

function endpointSchema(endpoint, methods) {
  const pathParams = [...(endpoint.path || '').matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  const properties = {};
  const required = [];

  if (methods.length > 1) {
    properties.method = { type: 'string', enum: methods, description: 'HTTP method to use.' };
    required.push('method');
  }
  if (pathParams.length > 0) {
    properties.path_params = {
      type: 'object',
      description: 'Values for the placeholders in the endpoint path.',
      properties: Object.fromEntries(pathParams.map(p => [p, { type: 'string' }])),
      required: pathParams,
    };
    required.push('path_params');
  }
  properties.query_params = {
    type: 'object',
    description: 'Query string parameters, as key/value pairs.',
  };
  if (methods.some(m => BODY_METHODS.includes(m))) {
    properties.body_data = {
      type: 'object',
      description: 'JSON request body (for POST/PUT/PATCH).',
    };
  }

  return { type: 'object', properties, required };
}

/**
 * @param {Object} agent - populated Agent document
 * @returns {{ functions: Array<{name, description, parameters}>, resolve: Function }}
 *   resolve(call) takes { name, arguments } (arguments = raw JSON string) and returns
 *   { tool_name, tool_parameters } or { error } when the call can't be mapped.
 */
function buildToolCatalog(agent) {
  const functions = [];
  const targets = new Map();
  const taken = new Set(agent.tools.map(t => t.name));

  for (const tool of agent.tools) {
    if (tool.name === 'api_caller') {
      continue;
    }
    functions.push({
      name: tool.name,
      description: tool.description || '',
      parameters: toolSchema(tool),
    });
    targets.set(tool.name, { tool_name: tool.name });
  }

  const apiCaller = agent.tools.find(t => t.name === 'api_caller');
  for (const [endpointName, endpoint] of Object.entries(apiCaller?.parameters?.endpoints || {})) {
    let functionName = endpointName;
    if (!FUNCTION_NAME.test(functionName) || taken.has(functionName)) {
      const base = `api_${sanitizeName(endpointName)}`;
      functionName = base;
      for (let i = 2; taken.has(functionName); i++) {
        functionName = `${base}_${i}`;
      }
    }
    taken.add(functionName);

    const methods = endpoint.methods?.length ? endpoint.methods : ['GET'];
    const summary = endpoint.description || `Call the "${endpointName}" API endpoint.`;
    functions.push({
      name: functionName,
      description: `${summary} (${methods.join('/')} ${endpoint.path || ''})`,
      parameters: endpointSchema(endpoint, methods),
    });
    targets.set(functionName, { tool_name: 'api_caller', endpoint_name: endpointName, methods });
  }

  const resolve = call => {
    const target = targets.get(call.name);
    if (!target) {
      return { error: `Unknown tool "${call.name}".` };
    }

    let args;
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      return { error: 'Arguments were not valid JSON.' };
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { error: 'Arguments must be a JSON object.' };
    }

    if (target.tool_name !== 'api_caller') {
      return { tool_name: target.tool_name, tool_parameters: args };
    }

    const toolParameters = {
      endpoint_name: target.endpoint_name,
      method: args.method || target.methods[0],
      path_params: args.path_params || {},
      query_params: args.query_params || {},
    };
    if (args.body_data !== undefined) {
      toolParameters.body_data = args.body_data;
    }
    return { tool_name: 'api_caller', tool_parameters: toolParameters };
  };

  return { functions, resolve };
}

module.exports = { buildToolCatalog };
