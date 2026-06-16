const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const voiceUsageSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    agent: {
      type: String,
      ref: 'Agent',
      required: true,
      index: true,
    },
    organization: {
      type: String,
      ref: 'Organization',
      index: true,
    },
    project: {
      type: String,
      ref: 'Project',
      index: true,
    },
    execution_id: {
      type: String,
      ref: 'AgentExecution',
      default: null,
    },
    conversation_id: {
      type: String,
      ref: 'Conversation',
      default: null,
    },
    use_case: {
      type: String,
      enum: ['presentation', 'chatbot_response', 'telephony', 'other'],
      required: true,
    },
    operation: {
      type: String,
      enum: ['tts', 'stt'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['openai', 'elevenlabs'],
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    voice_id: {
      type: String,
      default: null,
    },
    characters_used: {
      type: Number,
      default: 0,
    },
    duration_seconds: {
      type: Number,
      default: 0,
    },
    cost: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('VoiceUsage', voiceUsageSchema);
