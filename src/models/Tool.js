const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const toolSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    display_name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "web",
        "computation",
        "data",
        "communication",
        "utility",
        "llm",
        "custom",
      ],
      required: true,
    },
    parameters_schema: {
      type: {
        type: String,
        default: "object",
      },
      properties: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
      },
      required: [
        {
          type: String,
        },
      ],
      additionalProperties: {
        type: Boolean,
        default: false,
      },
    },
    return_schema: {
      type: {
        type: String,
        default: "object",
      },
      properties: {
        type: mongoose.Schema.Types.Mixed,
      },
    },
    implementation: {
      type: {
        type: String,
        enum: ["internal", "external_api", "webhook", "code"],
        required: true,
      },
      handler: {
        type: String,
        required: true,
      },
      config: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    is_system_tool: {
      type: Boolean,
      default: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    usage_stats: {
      total_calls: {
        type: Number,
        default: 0,
      },
      success_calls: {
        type: Number,
        default: 0,
      },
      failed_calls: {
        type: Number,
        default: 0,
      },
      avg_execution_time_ms: {
        type: Number,
        default: 0,
      },
    },
    version: {
      type: String,
      default: "1.0.0",
    },
  },
  {
    timestamps: true,
  }
);

// Method to increment usage stats
toolSchema.methods.recordUsage = function (success, executionTime) {
  this.usage_stats.total_calls += 1;

  if (success) {
    this.usage_stats.success_calls += 1;
  } else {
    this.usage_stats.failed_calls += 1;
  }

  // Update average execution time
  const totalCalls = this.usage_stats.total_calls;
  const currentAvg = this.usage_stats.avg_execution_time_ms;
  this.usage_stats.avg_execution_time_ms =
    (currentAvg * (totalCalls - 1) + executionTime) / totalCalls;

  return this.save();
};

// Method to validate parameters against schema
toolSchema.methods.validateParameters = function (parameters) {
  // Basic validation - in a real implementation, you might use a library like ajv
  const required = this.parameters_schema.required || [];
  const properties = this.parameters_schema.properties || {};

  // Check required parameters
  for (const requiredParam of required) {
    if (!(requiredParam in parameters)) {
      throw new Error(`Missing required parameter: ${requiredParam}`);
    }
  }

  // Check parameter types (basic validation)
  for (const [paramName, paramValue] of Object.entries(parameters)) {
    if (properties[paramName] && properties[paramName].type) {
      const expectedType = properties[paramName].type;
      const actualType = typeof paramValue;

      if (expectedType === "string" && actualType !== "string") {
        throw new Error(`Parameter ${paramName} must be a string`);
      }
      if (expectedType === "number" && actualType !== "number") {
        throw new Error(`Parameter ${paramName} must be a number`);
      }
      if (expectedType === "boolean" && actualType !== "boolean") {
        throw new Error(`Parameter ${paramName} must be a boolean`);
      }
    }
  }

  return true;
};

module.exports = mongoose.model("Tool", toolSchema);
