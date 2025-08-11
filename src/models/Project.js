const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const projectSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    organization: {
      type: String,
      ref: "Organization",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for API keys
projectSchema.virtual("apiKeys", {
  ref: "ApiKey",
  localField: "_id",
  foreignField: "project",
  justOne: false,
});

projectSchema.virtual("prompts", {
  ref: "Prompt",
  localField: "_id",
  foreignField: "project",
  justOne: false,
});

module.exports = mongoose.model("Project", projectSchema);
