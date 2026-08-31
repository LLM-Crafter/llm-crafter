/**
 * Helpers for third-party conversation annotations ("external metadata").
 *
 * External integrations (e.g. a CRM) attach arbitrary key/value pairs to a
 * conversation so 3rd-party frontends can filter/sort conversations
 * server-side instead of loading everything and filtering client-side.
 *
 * Values are stored on the Conversation document using the attribute pattern
 * (`external_attributes: [{ ns, key, s, n, b }]`) so MongoDB can index them
 * even though the key set is not known ahead of time. Callers of this module
 * work with a plain `{ key: value }` map — the array shape never leaks out.
 *
 * This data is intentionally kept separate from `dynamic_context`: it is a
 * filtering/reporting aid only and is never sent to the LLM.
 */

const LIMITS = {
  MAX_KEYS_PER_NAMESPACE: 100,
  MAX_NAMESPACE_LENGTH: 64,
  MAX_KEY_LENGTH: 64,
  MAX_STRING_VALUE_LENGTH: 1024,
  MAX_FILTERS_PER_REQUEST: 25,
};

// Namespaces and keys are restricted so they are safe to embed in query
// parameter names and predictable for integrators.
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

const FILTER_OPERATORS = [
  'eq',
  'ne',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
];

class ExternalAttributeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExternalAttributeError';
    this.statusCode = 422;
  }
}

/**
 * Turn a raw string like "example-app" into a valid namespace slug.
 * Used to derive a stable namespace from an API key name when the key has no
 * explicit `integration_slug`.
 */
function slugifyNamespace(input) {
  return (
    String(input || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, LIMITS.MAX_NAMESPACE_LENGTH) || 'integration'
  );
}

/**
 * Resolve the namespace an authenticated request writes into.
 * API-key requests always write into a namespace tied to the key so
 * integrations cannot clobber each other. JWT requests may pass an explicit
 * namespace in the body (defaulting to "internal").
 */
function resolveNamespace(req, bodyNamespace) {
  if (req.apiKey) {
    const raw =
      req.apiKey.integration_slug || slugifyNamespace(req.apiKey.name);
    return slugifyNamespace(raw);
  }
  if (bodyNamespace) {
    const ns = slugifyNamespace(bodyNamespace);
    if (!NAMESPACE_PATTERN.test(ns)) {
      throw new ExternalAttributeError(`Invalid namespace: ${bodyNamespace}`);
    }
    return ns;
  }
  return 'internal';
}

/** Coerce a scalar JSON value into the { s, n, b } column shape. */
function coerceValue(key, value) {
  if (typeof value === 'string') {
    if (value.length > LIMITS.MAX_STRING_VALUE_LENGTH) {
      throw new ExternalAttributeError(
        `Value for "${key}" exceeds ${LIMITS.MAX_STRING_VALUE_LENGTH} characters`
      );
    }
    return { s: value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { n: value };
  }
  if (typeof value === 'boolean') {
    return { b: value };
  }
  throw new ExternalAttributeError(
    `Value for "${key}" must be a string, finite number, boolean or null`
  );
}

/**
 * Apply a `{ key: value }` patch to a conversation's external_attributes for a
 * single namespace. `null` values delete the key. When `replace` is true, keys
 * in the namespace that are absent from `values` are removed too.
 *
 * Mutates `conversation.external_attributes` in place. Returns a summary of
 * what changed. Throws ExternalAttributeError on validation failure.
 */
function applyNamespacePatch(
  conversation,
  ns,
  values,
  apiKeyId,
  { replace = false } = {}
) {
  if (!NAMESPACE_PATTERN.test(ns)) {
    throw new ExternalAttributeError(`Invalid namespace: ${ns}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new ExternalAttributeError('`values` must be an object');
  }

  const entries = Object.entries(values);
  for (const [key] of entries) {
    if (!KEY_PATTERN.test(key)) {
      throw new ExternalAttributeError(
        `Invalid key "${key}" (allowed: letters, digits, "_", "-", ".", ":", max ${LIMITS.MAX_KEY_LENGTH} chars)`
      );
    }
  }

  if (!Array.isArray(conversation.external_attributes)) {
    conversation.external_attributes = [];
  }

  const now = new Date();
  const updated = [];
  const removed = [];
  const keptKeys = new Set();

  for (const [key, value] of entries) {
    const idx = conversation.external_attributes.findIndex(
      a => a.ns === ns && a.key === key
    );

    if (value === null) {
      if (idx !== -1) {
        conversation.external_attributes.splice(idx, 1);
        removed.push(key);
      }
      continue;
    }

    const columns = coerceValue(key, value);
    const next = {
      ns,
      key,
      s: undefined,
      n: undefined,
      b: undefined,
      ...columns,
      updated_by: apiKeyId || null,
      updated_at: now,
    };

    if (idx === -1) {
      conversation.external_attributes.push(next);
    } else {
      conversation.external_attributes.splice(idx, 1, next);
    }
    updated.push(key);
    keptKeys.add(key);
  }

  if (replace) {
    for (let i = conversation.external_attributes.length - 1; i >= 0; i--) {
      const a = conversation.external_attributes[i];
      if (a.ns === ns && !keptKeys.has(a.key)) {
        conversation.external_attributes.splice(i, 1);
        removed.push(a.key);
      }
    }
  }

  const nsCount = conversation.external_attributes.filter(
    a => a.ns === ns
  ).length;
  if (nsCount > LIMITS.MAX_KEYS_PER_NAMESPACE) {
    throw new ExternalAttributeError(
      `Namespace "${ns}" would hold ${nsCount} keys (max ${LIMITS.MAX_KEYS_PER_NAMESPACE})`
    );
  }

  return { namespace: ns, updated, removed, key_count: nsCount };
}

/** Read the stored value out of an attribute row. */
function attributeValue(a) {
  if (a.s !== undefined && a.s !== null) return a.s;
  if (a.n !== undefined && a.n !== null) return a.n;
  if (a.b !== undefined && a.b !== null) return a.b;
  return null;
}

/**
 * Convert an external_attributes array into the nested map shape returned by
 * the API: { "<namespace>": { "<key>": <value> } }.
 */
function attributesToMap(attributes) {
  const out = {};
  if (!Array.isArray(attributes)) return out;
  for (const a of attributes) {
    if (!a || !a.ns || !a.key) continue;
    if (!out[a.ns]) out[a.ns] = {};
    out[a.ns][a.key] = attributeValue(a);
  }
  return out;
}

/** Build the value side of a `$elemMatch` condition for an eq/ne comparison. */
function scalarMatch(rawValue, negate) {
  const candidates = [];
  if (rawValue === 'true' || rawValue === 'false') {
    candidates.push({ b: rawValue === 'true' });
  }
  const asNumber = Number(rawValue);
  if (rawValue !== '' && Number.isFinite(asNumber)) {
    candidates.push({ n: asNumber });
  }
  candidates.push({ s: String(rawValue) });

  if (!negate) {
    return candidates.length === 1 ? candidates[0] : { $or: candidates };
  }
  // Negation: the element must not match any candidate representation.
  return {
    $nor: candidates.map(c => {
      const [[field, val]] = Object.entries(c);
      return { [field]: val };
    }),
  };
}

/**
 * Parse `meta.<ns>.<key>` (and `meta.<ns>.<key>[op]`) query parameters into
 * MongoDB filter fragments against `external_attributes`.
 *
 * With Express' default `qs` parser:
 *   ?meta.crm.priority=hot            -> { 'meta.crm.priority': 'hot' }
 *   ?meta.crm.score[gte]=50           -> { 'meta.crm.score': { gte: '50' } }
 *
 * Returns { clauses: [...mongoFragments], errors: [...strings] }.
 * `clauses` are ANDed together by the caller.
 */
function parseAttributeFilters(query) {
  const clauses = [];
  const errors = [];
  let count = 0;

  for (const [rawKey, rawVal] of Object.entries(query || {})) {
    if (!rawKey.startsWith('meta.')) continue;

    if (++count > LIMITS.MAX_FILTERS_PER_REQUEST) {
      errors.push(
        `Too many metadata filters (max ${LIMITS.MAX_FILTERS_PER_REQUEST})`
      );
      break;
    }

    const path = rawKey.slice('meta.'.length);
    const dot = path.indexOf('.');
    if (dot < 1 || dot === path.length - 1) {
      errors.push(
        `Malformed metadata filter "${rawKey}" (expected meta.<namespace>.<key>)`
      );
      continue;
    }
    const ns = path.slice(0, dot);
    const key = path.slice(dot + 1);
    if (!NAMESPACE_PATTERN.test(ns) || !KEY_PATTERN.test(key)) {
      errors.push(`Invalid namespace or key in "${rawKey}"`);
      continue;
    }

    // Normalise to { op: value }
    let op = 'eq';
    let value = rawVal;
    if (
      rawVal !== null &&
      typeof rawVal === 'object' &&
      !Array.isArray(rawVal)
    ) {
      const ops = Object.keys(rawVal);
      if (ops.length !== 1) {
        errors.push(`Filter "${rawKey}" must specify exactly one operator`);
        continue;
      }
      op = ops[0];
      value = rawVal[op];
    }
    if (!FILTER_OPERATORS.includes(op)) {
      errors.push(`Unknown operator "${op}" in "${rawKey}"`);
      continue;
    }

    if (op === 'exists') {
      const want = value !== 'false' && value !== false;
      clauses.push(
        want
          ? { external_attributes: { $elemMatch: { ns, key } } }
          : { external_attributes: { $not: { $elemMatch: { ns, key } } } }
      );
      continue;
    }

    if (op === 'in' || op === 'nin') {
      const list = (Array.isArray(value) ? value : String(value).split(','))
        .map(v => String(v).trim())
        .filter(Boolean);
      if (list.length === 0) {
        errors.push(`Operator "${op}" in "${rawKey}" needs at least one value`);
        continue;
      }
      const numeric = list.map(v => Number(v)).filter(n => Number.isFinite(n));
      const valueCond = {
        $or: [
          { s: { $in: list } },
          ...(numeric.length ? [{ n: { $in: numeric } }] : []),
        ],
      };
      clauses.push(
        op === 'in'
          ? { external_attributes: { $elemMatch: { ns, key, ...valueCond } } }
          : {
              external_attributes: {
                $not: { $elemMatch: { ns, key, ...valueCond } },
              },
            }
      );
      continue;
    }

    if (['gt', 'gte', 'lt', 'lte'].includes(op)) {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push(`Operator "${op}" in "${rawKey}" requires a numeric value`);
        continue;
      }
      clauses.push({
        external_attributes: {
          $elemMatch: { ns, key, n: { [`$${op}`]: num } },
        },
      });
      continue;
    }

    // eq / ne
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      errors.push(`Filter "${rawKey}" has an unsupported value`);
      continue;
    }
    if (op === 'eq') {
      clauses.push({
        external_attributes: {
          $elemMatch: { ns, key, ...scalarMatch(value, false) },
        },
      });
    } else {
      clauses.push({
        external_attributes: {
          $elemMatch: { ns, key, ...scalarMatch(value, true) },
        },
      });
    }
  }

  return { clauses, errors };
}

module.exports = {
  LIMITS,
  NAMESPACE_PATTERN,
  KEY_PATTERN,
  FILTER_OPERATORS,
  ExternalAttributeError,
  slugifyNamespace,
  resolveNamespace,
  applyNamespacePatch,
  attributesToMap,
  attributeValue,
  parseAttributeFilters,
};
