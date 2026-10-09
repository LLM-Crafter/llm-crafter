const KnowledgeBase = require('../models/KnowledgeBase');
const Agent = require('../models/Agent');
const ApiKey = require('../models/ApiKey');
const ragService = require('../services/ragService');

function findScoped(req) {
  return KnowledgeBase.findOne({
    _id: String(req.params.kbId),
    organization_id: req.params.orgId,
    project_id: req.params.projectId,
  });
}

// Returns an error message, or null when the key can be used for this project's embeddings
async function validateEmbeddingApiKey(apiKeyId, projectId) {
  const apiKey = await ApiKey.findOne({
    _id: String(apiKeyId),
    project: projectId,
  }).populate('provider');
  if (!apiKey) {
    return 'Embedding API key not found in this project';
  }
  if (!apiKey.is_active) {
    return 'Embedding API key is inactive';
  }
  if (!ragService.supportsEmbeddings(apiKey.provider?.name)) {
    return `Provider '${apiKey.provider?.name}' does not support embeddings, use an OpenAI key`;
  }
  return null;
}

function agentsUsingKnowledgeBase(orgId, projectId, kbId) {
  return Agent.find({
    organization: orgId,
    project: projectId,
    tools: {
      $elemMatch: { name: 'rag_search', 'parameters.knowledge_base_ids': kbId },
    },
  })
    .select('_id name')
    .lean();
}

const listKnowledgeBases = async (req, res) => {
  try {
    const knowledgeBases = await KnowledgeBase.find({
      organization_id: req.params.orgId,
      project_id: req.params.projectId,
    })
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, knowledge_bases: knowledgeBases });
  } catch (error) {
    console.error('List knowledge bases error:', error);
    res.status(500).json({ success: false, error: 'Failed to list knowledge bases' });
  }
};

const createKnowledgeBase = async (req, res) => {
  try {
    const { name, description } = req.body;
    const embeddingApiKeyId = req.body.embedding_api_key_id || null;

    if (embeddingApiKeyId) {
      const keyError = await validateEmbeddingApiKey(
        embeddingApiKeyId,
        req.params.projectId
      );
      if (keyError) {
        return res.status(400).json({ success: false, error: keyError });
      }
    }

    const knowledgeBase = await KnowledgeBase.create({
      organization_id: req.params.orgId,
      project_id: req.params.projectId,
      name,
      description,
      embedding_api_key_id: embeddingApiKeyId,
      created_by: req.user._id,
    });

    res.status(201).json({ success: true, knowledge_base: knowledgeBase });
  } catch (error) {
    console.error('Create knowledge base error:', error);
    res.status(500).json({ success: false, error: 'Failed to create knowledge base' });
  }
};

const getKnowledgeBase = async (req, res) => {
  try {
    const knowledgeBase = await findScoped(req).lean();
    if (!knowledgeBase) {
      return res.status(404).json({ success: false, error: 'Knowledge base not found' });
    }

    let stats = null;
    try {
      stats = await ragService.getStats(
        req.params.orgId,
        req.params.projectId,
        knowledgeBase._id
      );
    } catch (statsError) {
      console.warn('Knowledge base stats unavailable:', statsError.message);
    }

    const agents = await agentsUsingKnowledgeBase(
      req.params.orgId,
      req.params.projectId,
      knowledgeBase._id
    );

    res.json({ success: true, knowledge_base: knowledgeBase, stats, agents });
  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({ success: false, error: 'Failed to get knowledge base' });
  }
};

const updateKnowledgeBase = async (req, res) => {
  try {
    const knowledgeBase = await findScoped(req);
    if (!knowledgeBase) {
      return res.status(404).json({ success: false, error: 'Knowledge base not found' });
    }

    if (req.body.name !== undefined) {
      knowledgeBase.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      knowledgeBase.description = req.body.description;
    }
    if (req.body.embedding_api_key_id !== undefined) {
      // null or '' clears the override, falling back to the caller's key
      const embeddingApiKeyId = req.body.embedding_api_key_id || null;
      if (embeddingApiKeyId) {
        const keyError = await validateEmbeddingApiKey(
          embeddingApiKeyId,
          req.params.projectId
        );
        if (keyError) {
          return res.status(400).json({ success: false, error: keyError });
        }
      }
      knowledgeBase.embedding_api_key_id = embeddingApiKeyId;
    }
    await knowledgeBase.save();

    res.json({ success: true, knowledge_base: knowledgeBase });
  } catch (error) {
    console.error('Update knowledge base error:', error);
    res.status(500).json({ success: false, error: 'Failed to update knowledge base' });
  }
};

const deleteKnowledgeBase = async (req, res) => {
  try {
    const knowledgeBase = await findScoped(req);
    if (!knowledgeBase) {
      return res.status(404).json({ success: false, error: 'Knowledge base not found' });
    }

    // Unlinking silently would drop those agents back onto the shared project KB
    const agents = await agentsUsingKnowledgeBase(
      req.params.orgId,
      req.params.projectId,
      knowledgeBase._id
    );
    if (agents.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Knowledge base is still assigned to agents. Unassign it first.',
        agents,
      });
    }

    const result = await ragService.clearIndex(
      req.params.orgId,
      req.params.projectId,
      knowledgeBase._id
    );
    await knowledgeBase.deleteOne();

    res.json({
      success: true,
      message: 'Knowledge base deleted',
      deleted_count: result?.deleted_count ?? null,
    });
  } catch (error) {
    console.error('Delete knowledge base error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete knowledge base' });
  }
};

module.exports = {
  listKnowledgeBases,
  createKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
};
