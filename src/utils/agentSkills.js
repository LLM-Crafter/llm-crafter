'use strict';

const { v4: uuidv4 } = require('uuid');

const MAX_SKILLS = 50;
const MAX_DESCRIPTION_CHARS = 1024;
// Roughly 5,000 tokens. Up to three skills can be active on every LLM call of a turn.
const MAX_INSTRUCTIONS_CHARS = 20_000;
const SKILL_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const SKILL_CLOSING_TAG = /<\/skill\s*>/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a `skills` array from a create/update request body.
 * Assigns stable ids where missing (mutates entries in place).
 * Returns an error message string, or null when valid.
 */
function validateSkills(skills) {
  if (!Array.isArray(skills)) {return 'skills must be an array';}
  if (skills.length > MAX_SKILLS) {return `skills: at most ${MAX_SKILLS} skills are allowed`;}

  const seenIds = new Set();
  const seenNames = new Set();
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    if (!skill || typeof skill !== 'object') {return `skills[${i}] must be an object`;}

    if (!skill.id) {skill.id = uuidv4();}
    if (typeof skill.id !== 'string' || !SKILL_IDENTIFIER.test(skill.id)) {
      return `skills[${i}]: id may only contain letters, numbers, "_" and "-" (max 64 characters)`;
    }
    if (seenIds.has(skill.id)) {return `skills[${i}]: duplicate skill id`;}
    seenIds.add(skill.id);

    if (typeof skill.name !== 'string' || !SKILL_IDENTIFIER.test(skill.name)) {
      return `skills[${i}]: name is required and may only contain letters, numbers, "_" and "-" (max 64 characters)`;
    }
    if (seenNames.has(skill.name)) {return `skills[${i}]: duplicate skill name`;}
    seenNames.add(skill.name);

    if (!isNonEmptyString(skill.description)) {return `skills[${i}]: description is required`;}
    if (skill.description.length > MAX_DESCRIPTION_CHARS) {
      return `skills[${i}]: description must be at most ${MAX_DESCRIPTION_CHARS} characters`;
    }

    if (skill.not_for !== undefined && skill.not_for !== null) {
      if (typeof skill.not_for !== 'string') {return `skills[${i}]: not_for must be a string`;}
      if (skill.not_for.length > MAX_DESCRIPTION_CHARS) {
        return `skills[${i}]: not_for must be at most ${MAX_DESCRIPTION_CHARS} characters`;
      }
    }

    if (!isNonEmptyString(skill.instructions)) {return `skills[${i}]: instructions is required`;}
    if (skill.instructions.length > MAX_INSTRUCTIONS_CHARS) {
      return `skills[${i}]: instructions must be at most ${MAX_INSTRUCTIONS_CHARS} characters`;
    }
    if (SKILL_CLOSING_TAG.test(skill.instructions)) {
      return `skills[${i}]: instructions must not contain a closing </skill> tag`;
    }

    if (skill.enabled !== undefined && typeof skill.enabled !== 'boolean') {
      return `skills[${i}]: enabled must be a boolean`;
    }
  }
  return null;
}

module.exports = { validateSkills, MAX_SKILLS, MAX_DESCRIPTION_CHARS, MAX_INSTRUCTIONS_CHARS };
