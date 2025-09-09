const Tool = require('../models/Tool');
const toolService = require('../services/toolService');

const getTools = async (req, res) => {
  try {
    const { category, search } = req.query;

    const filter = { is_active: true };
    if (category) {filter.category = category;}
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { display_name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tools = await Tool.find(filter)
      .select(
        'name display_name description category parameters_schema usage_stats version'
      )
      .sort({ name: 1 });

    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
};

const getTool = async (req, res) => {
  try {
    const tool = await Tool.findOne({
      name: req.params.toolName,
      is_active: true
    });

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tool' });
  }
};

const createTool = async (req, res) => {
  try {
    const tool = new Tool({
      name: req.body.name,
      display_name: req.body.display_name,
      description: req.body.description,
      category: req.body.category,
      parameters_schema: req.body.parameters_schema,
      return_schema: req.body.return_schema,
      implementation: req.body.implementation,
      is_system_tool: false // Custom tools are not system tools
    });

    await tool.save();

    // Register handler if implementation type is 'code'
    if (tool.implementation.type === 'code') {
      // In a real implementation, you might dynamically load the handler
      console.log(
        `Custom tool '${tool.name}' created. Handler registration required.`
      );
    }

    res.status(201).json(tool);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Tool name already exists' });
    }
    res.status(500).json({ error: 'Failed to create tool' });
  }
};

const updateTool = async (req, res) => {
  try {
    const tool = await Tool.findOne({ name: req.params.toolName });

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Don't allow updating system tools
    if (tool.is_system_tool) {
      return res.status(403).json({ error: 'Cannot update system tools' });
    }

    // Update fields
    if (req.body.display_name !== undefined)
    {tool.display_name = req.body.display_name;}
    if (req.body.description !== undefined)
    {tool.description = req.body.description;}
    if (req.body.category !== undefined) {tool.category = req.body.category;}
    if (req.body.parameters_schema !== undefined)
    {tool.parameters_schema = req.body.parameters_schema;}
    if (req.body.return_schema !== undefined)
    {tool.return_schema = req.body.return_schema;}
    if (req.body.implementation !== undefined)
    {tool.implementation = req.body.implementation;}
    if (req.body.is_active !== undefined) {tool.is_active = req.body.is_active;}

    await tool.save();

    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tool' });
  }
};

const deleteTool = async (req, res) => {
  try {
    const tool = await Tool.findOne({ name: req.params.toolName });

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Don't allow deleting system tools
    if (tool.is_system_tool) {
      return res.status(403).json({ error: 'Cannot delete system tools' });
    }

    await Tool.findOneAndDelete({ name: req.params.toolName });

    res.json({ message: 'Tool deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tool' });
  }
};

const executeTool = async (req, res) => {
  try {
    const { parameters = {} } = req.body;

    const result = await toolService.executeTool(
      req.params.toolName,
      parameters
    );

    if (result.success) {
      res.json({
        success: true,
        result: result.result,
        execution_time_ms: result.execution_time_ms,
        tool_name: result.tool_name
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        execution_time_ms: result.execution_time_ms,
        tool_name: result.tool_name
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Tool execution failed',
      details: error.message
    });
  }
};

const getToolCategories = async (req, res) => {
  try {
    const categories = await Tool.distinct('category', { is_active: true });
    res.json(categories.sort());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tool categories' });
  }
};

const getToolUsageStats = async (req, res) => {
  try {
    const tool = await Tool.findOne({
      name: req.params.toolName,
      is_active: true
    }).select('name usage_stats');

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({
      tool_name: tool.name,
      usage_stats: tool.usage_stats
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tool usage stats' });
  }
};

module.exports = {
  getTools,
  getTool,
  createTool,
  updateTool,
  deleteTool,
  executeTool,
  getToolCategories,
  getToolUsageStats
};
