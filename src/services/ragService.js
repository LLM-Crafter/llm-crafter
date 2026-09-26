const crypto = require('crypto');
const OpenAIService = require('./openaiService');
const ApiKey = require('../models/ApiKey');
const VectorDatabaseConfig = require('../models/VectorDatabaseConfig');
const { createVectorDatabase } = require('./vectorDatabaseService');

class RAGService {
  constructor() {
    this.vectorDBInstances = new Map(); // Cache for vector DB connections
  }

  buildScope(organizationId, projectId, knowledgeBaseId = null) {
    return {
      organization_id: organizationId,
      project_id: projectId,
      knowledge_base_id: knowledgeBaseId || null,
    };
  }

  resolveDocumentId(doc) {
    if (doc.id !== undefined && doc.id !== null && doc.id !== '') {
      return String(doc.id);
    }
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(doc))
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Clear cached vector database instances
   */
  clearVectorDBCache() {
    this.vectorDBInstances.clear();
  }

  /**
   * Get or create vector database instance for organization/project
   */
  async getVectorDatabase(organizationId, projectId) {
    const key = `${organizationId}_${projectId}`;

    // Check cache first
    if (this.vectorDBInstances.has(key)) {
      const instance = this.vectorDBInstances.get(key);
      // Check if instance is valid and has the required method
      if (
        instance.isConnected &&
        typeof instance.indexDocument === 'function'
      ) {
        return instance;
      }
      // Remove invalid instance from cache
      this.vectorDBInstances.delete(key);
    }

    // Get vector database configuration
    let config = await VectorDatabaseConfig.findDefault(
      organizationId,
      projectId
    );

    // If no configuration found, use memory storage
    if (!config) {
      console.log(
        `No vector DB config found for org ${organizationId} project ${projectId}, using memory storage`
      );
      config = {
        provider: 'memory',
        config: { memory: { maxDocuments: 10000 } },
      };
    }

    // Create vector database instance
    const providerConfig =
      config.config && config.config[config.provider]
        ? config.config[config.provider]
        : {};
    const vectorDB = createVectorDatabase({
      provider: config.provider,
      ...providerConfig,
    });

    // Connect to the database
    await vectorDB.connect();

    // Cache the instance
    this.vectorDBInstances.set(key, vectorDB);

    // Update connection status if this is a saved config
    if (config._id) {
      config.connection_status.status = 'connected';
      config.connection_status.last_tested = new Date();
      await config.save();
    }

    return vectorDB;
  }

  /**
   * Process and index JSON documents for RAG
   */
  async indexJsonDocuments(
    documents,
    organizationId,
    projectId,
    apiKeyId,
    knowledgeBaseId = null
  ) {
    const startTime = Date.now();
    const indexed = [];
    const scopeKey = knowledgeBaseId || 'project';

    try {
      // Get vector database instance
      const vectorDB = await this.getVectorDatabase(organizationId, projectId);

      for (const doc of documents) {
        try {
          const chunks = await this.processJsonDocument(
            doc,
            organizationId,
            projectId
          );
          const embeddings = await this.generateEmbeddings(chunks, apiKeyId);
          const documentId = this.resolveDocumentId(doc);

          for (let i = 0; i < chunks.length; i++) {
            // Deterministic so re-indexing a document overwrites its chunks instead of duplicating them
            const chunkId = `${organizationId}_${projectId}_${scopeKey}_${documentId}_${i}`;
            const documentData = {
              id: chunkId,
              content: chunks[i].content,
              title: chunks[i].metadata.title || doc.title || '',
              source: chunks[i].metadata.source || doc.source || '',
              document_id: documentId,
              chunk_index: i,
              organization_id: organizationId,
              project_id: projectId,
              knowledge_base_id: knowledgeBaseId || null,
              embedding: embeddings[i],
            };

            await vectorDB.indexDocument(documentData);

            indexed.push(chunkId);
          }
        } catch (error) {
          console.error('Error indexing document:', error);
          // Continue with other documents
        }
      }

      // Update usage statistics
      const config = await VectorDatabaseConfig.findDefault(
        organizationId,
        projectId
      );
      if (config) {
        config.updateUsageStats('index', {
          documents_count: indexed.length,
          index_time_ms: Date.now() - startTime,
          success: true,
        });
        await config.save();
      }

      return indexed;
    } catch (error) {
      console.error('RAG indexing error:', error);

      // Update error statistics
      const config = await VectorDatabaseConfig.findDefault(
        organizationId,
        projectId
      );
      if (config) {
        config.updateUsageStats('index', {
          documents_count: 0,
          index_time_ms: Date.now() - startTime,
          success: false,
        });
        await config.save();
      }

      throw error;
    }
  }

  /**
   * Process a JSON document into searchable chunks - Generic approach for any format
   */
  async processJsonDocument(jsonDoc, organizationId, projectId) {
    const chunks = [];

    // Strategy: Create intelligent chunks based on what's available in the document
    // This works for any JSON structure

    // 1. Main content chunk - Combine the most important text fields
    const mainTextFields = this.extractMainTextContent(jsonDoc);
    if (mainTextFields.content.trim()) {
      chunks.push({
        content: mainTextFields.content,
        metadata: {
          type: 'main_content',
          ...this.extractBasicMetadata(jsonDoc),
          text_fields: mainTextFields.fields_used,
          organization_id: organizationId,
          project_id: projectId,
          indexed_at: new Date().toISOString(),
        },
      });
    }

    // 2. Structured data chunks - Handle arrays and nested objects
    const structuredChunks = this.extractStructuredContent(jsonDoc);
    for (const chunk of structuredChunks) {
      chunks.push({
        content: chunk.content,
        metadata: {
          type: chunk.type,
          ...this.extractBasicMetadata(jsonDoc),
          structure_type: chunk.structure_type,
          original_field: chunk.original_field,
          organization_id: organizationId,
          project_id: projectId,
          indexed_at: new Date().toISOString(),
        },
      });
    }

    // 3. Raw JSON chunk - For exact searches and complex queries
    // This preserves the entire document structure
    chunks.push({
      content: `Document: ${JSON.stringify(jsonDoc, null, 2)}`,
      metadata: {
        type: 'raw_json',
        ...this.extractBasicMetadata(jsonDoc),
        organization_id: organizationId,
        project_id: projectId,
        indexed_at: new Date().toISOString(),
        raw_document: jsonDoc, // Store the original for reference
      },
    });

    return chunks;
  }

  /**
   * Extract main text content from any JSON structure
   */
  extractMainTextContent(jsonDoc) {
    const textFields = [];
    const fieldsUsed = [];

    // Common text fields to prioritize (order matters for relevance)
    const priorityFields = [
      'title',
      'name',
      'subject',
      'headline',
      'summary',
      'description',
      'abstract',
      'overview',
      'content',
      'body',
      'text',
      'message',
      'details',
    ];

    // Extract priority fields first
    for (const field of priorityFields) {
      if (
        jsonDoc[field] &&
        typeof jsonDoc[field] === 'string' &&
        jsonDoc[field].trim()
      ) {
        textFields.push(jsonDoc[field].trim());
        fieldsUsed.push(field);
      }
    }

    // If we don't have enough content, look for other string fields
    if (textFields.join(' ').length < 100) {
      for (const [key, value] of Object.entries(jsonDoc)) {
        if (
          !priorityFields.includes(key) &&
          typeof value === 'string' &&
          value.trim() &&
          value.length > 10
        ) {
          textFields.push(`${key}: ${value.trim()}`);
          fieldsUsed.push(key);
        }
      }
    }

    return {
      content: textFields.join('\n\n'),
      fields_used: fieldsUsed,
    };
  }

  /**
   * Extract structured content (arrays, objects) from any JSON
   */
  extractStructuredContent(jsonDoc) {
    const chunks = [];

    for (const [key, value] of Object.entries(jsonDoc)) {
      // Handle arrays
      if (Array.isArray(value) && value.length > 0) {
        const arrayContent = this.formatArrayContent(key, value);
        if (arrayContent) {
          chunks.push({
            content: arrayContent,
            type: 'structured_array',
            structure_type: 'array',
            original_field: key,
          });
        }
      }

      // Handle nested objects
      else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const objectContent = this.formatObjectContent(key, value);
        if (objectContent) {
          chunks.push({
            content: objectContent,
            type: 'structured_object',
            structure_type: 'object',
            original_field: key,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Format array content for search
   */
  formatArrayContent(fieldName, array) {
    if (array.length === 0) return null;

    // Handle array of strings
    if (array.every(item => typeof item === 'string')) {
      return `${fieldName.toUpperCase()}:\n${array.join('\n')}`;
    }

    // Handle array of objects
    if (array.every(item => typeof item === 'object')) {
      const formatted = array
        .map((item, index) => {
          const itemText = Object.entries(item)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          return `${index + 1}. ${itemText}`;
        })
        .join('\n');
      return `${fieldName.toUpperCase()}:\n${formatted}`;
    }

    // Handle mixed arrays
    return `${fieldName.toUpperCase()}:\n${array.join(', ')}`;
  }

  /**
   * Format object content for search
   */
  formatObjectContent(fieldName, obj) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return null;

    const formatted = entries
      .map(([k, v]) => {
        if (typeof v === 'object') {
          return `${k}: ${JSON.stringify(v)}`;
        }
        return `${k}: ${v}`;
      })
      .join('\n');

    return `${fieldName.toUpperCase()}:\n${formatted}`;
  }

  /**
   * Extract basic metadata from any JSON structure
   */
  extractBasicMetadata(jsonDoc) {
    const metadata = {};

    // Common metadata fields that might exist
    const metadataFields = [
      'id',
      '_id',
      'url',
      'link',
      'source',
      'title',
      'name',
      'subject',
      'author',
      'creator',
      'user',
      'date',
      'created_at',
      'updated_at',
      'timestamp',
      'category',
      'type',
      'tag',
      'tags',
      'status',
      'state',
      'priority',
      'brand',
      'model',
      'version', // Keep some domain-specific ones
    ];

    for (const field of metadataFields) {
      if (jsonDoc[field] !== undefined && jsonDoc[field] !== null) {
        metadata[field] = jsonDoc[field];
      }
    }

    return metadata;
  }

  /**
   * Generate embeddings for text chunks
   */
  async generateEmbeddings(chunks, apiKeyId) {
    const apiKey = await ApiKey.findById(apiKeyId).populate('provider');
    if (!apiKey || !apiKey.is_active) {
      throw new Error('Invalid or inactive API key');
    }

    const decryptedKey = apiKey.getDecryptedKey();
    const openai = new OpenAIService(decryptedKey, apiKey.provider.name);

    const embeddings = [];
    for (const chunk of chunks) {
      try {
        const result = await openai.createEmbedding({
          input: chunk.content,
          model: 'text-embedding-3-small',
        });
        const embedding = result.data[0].embedding;
        console.log(
          `  📊 Generated embedding with ${embedding.length} dimensions`
        );
        embeddings.push(embedding);
      } catch (error) {
        console.error('Error generating embedding:', error);
        // Use zero vector as fallback
        embeddings.push(new Array(1536).fill(0));
      }
    }

    return embeddings;
  }

  /**
   * Generate an embedding for a search query
   */
  async embedQuery(query, apiKeyId) {
    const apiKey = await ApiKey.findById(apiKeyId).populate('provider');
    if (!apiKey || !apiKey.is_active) {
      throw new Error('Invalid or inactive API key');
    }

    const openai = new OpenAIService(
      apiKey.getDecryptedKey(),
      apiKey.provider.name
    );
    const response = await openai.createEmbedding({
      input: query,
      model: 'text-embedding-3-small',
    });
    return response.data[0].embedding;
  }

  /**
   * Normalize a provider result (flat fields) into { id, content, similarity, metadata }
   */
  formatResult(match, includeMetadata = true) {
    const {
      id,
      content,
      text,
      score,
      similarity,
      embedding,
      organization_id,
      project_id,
      knowledge_base_id,
      ...metadata
    } = match;

    return {
      id,
      content: content || text,
      similarity: similarity ?? score,
      metadata: includeMetadata ? metadata : undefined,
    };
  }

  /**
   * Search for relevant documents using vector similarity
   */
  async searchSimilar(
    query,
    organizationId,
    projectId,
    apiKeyId,
    options = {}
  ) {
    const { limit = 10, includeMetadata = true, knowledgeBaseId = null } =
      options;

    console.log('🧠 RAGService.searchSimilar', {
      organizationId,
      projectId,
      knowledgeBaseId,
      limit,
    });

    try {
      const vectorDB = await this.getVectorDatabase(organizationId, projectId);
      const queryEmbedding = await this.embedQuery(query, apiKeyId);

      const matches = await vectorDB.search(
        query,
        queryEmbedding,
        limit,
        this.buildScope(organizationId, projectId, knowledgeBaseId)
      );

      return {
        query,
        results: matches
          .slice(0, limit)
          .map(match => this.formatResult(match, includeMetadata)),
        total_results: matches.length,
        search_method: 'semantic_vectordb',
      };
    } catch (error) {
      console.error('❌ RAGService.searchSimilar error:', error);
      return {
        query,
        results: [],
        total_results: 0,
        error: error.message,
        search_method: 'semantic',
      };
    }
  }

  /**
   * Enhanced search with hybrid approach (semantic + keyword + metadata filters)
   */
  async hybridSearch(query, organizationId, projectId, apiKeyId, options = {}) {
    const {
      limit = 10,
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      brands = [],
      models = [],
      themes = [],
      dateRange = null,
      sentiment = null,
      knowledgeBaseId = null,
    } = options;

    try {
      // Get semantic results
      const semanticResults = await this.searchSimilar(
        query,
        organizationId,
        projectId,
        apiKeyId,
        { limit: limit * 2, threshold: 0.5, knowledgeBaseId }
      );

      // Get keyword matches
      const keywordResults = await this.keywordSearch(
        query,
        organizationId,
        projectId,
        { brands, models, themes, dateRange, sentiment, knowledgeBaseId }
      );

      // Combine and rank results
      const combinedResults = this.combineSearchResults(
        semanticResults.results,
        keywordResults,
        semanticWeight,
        keywordWeight
      );

      return {
        query,
        results: combinedResults.slice(0, limit),
        total_results: combinedResults.length,
        search_method: 'hybrid',
        semantic_results: semanticResults.results.length,
        keyword_results: keywordResults.length,
      };
    } catch (error) {
      console.error('Hybrid search error:', error);
      return {
        query,
        results: [],
        total_results: 0,
        error: error.message,
      };
    }
  }

  /**
   * Keyword-based search with metadata filtering
   */
  async keywordSearch(query, organizationId, projectId, filters = {}) {
    const {
      brands = [],
      models = [],
      themes = [],
      sentiment = null,
      knowledgeBaseId = null,
    } = filters;

    const vectorDB = await this.getVectorDatabase(organizationId, projectId);
    // Only providers that can enumerate documents (memory) support keyword matching
    if (typeof vectorDB.getAllDocuments !== 'function') {
      return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) {
      return [];
    }

    const docs = await vectorDB.getAllDocuments(
      this.buildScope(organizationId, projectId, knowledgeBaseId)
    );

    return docs
      .filter(doc => {
        if (brands.length > 0 && !brands.includes(doc.brand)) {
          return false;
        }
        if (models.length > 0 && !models.includes(doc.model)) {
          return false;
        }
        if (themes.length > 0) {
          const docThemes = doc.themes || [];
          if (!themes.some(theme => docThemes.includes(theme))) {
            return false;
          }
        }
        if (sentiment && doc.sentiment !== sentiment) {
          return false;
        }
        return true;
      })
      .map(doc => {
        const content = (doc.content || '').toLowerCase();
        const title = (doc.title || '').toLowerCase();

        const contentMatches = queryWords.filter(word =>
          content.includes(word)
        ).length;
        const titleMatches = queryWords.filter(word =>
          title.includes(word)
        ).length;

        const keywordScore =
          (contentMatches + titleMatches * 2) / (queryWords.length * 3);

        return {
          ...this.formatResult(doc),
          keywordScore,
          similarity: keywordScore,
        };
      })
      .filter(result => result.keywordScore > 0)
      .sort((a, b) => b.keywordScore - a.keywordScore);
  }

  /**
   * Combine semantic and keyword search results
   */
  combineSearchResults(
    semanticResults,
    keywordResults,
    semanticWeight,
    keywordWeight
  ) {
    const resultMap = new Map();

    // Add semantic results
    semanticResults.forEach(result => {
      resultMap.set(result.id, {
        ...result,
        finalScore: result.similarity * semanticWeight,
        semanticScore: result.similarity,
        keywordScore: 0,
      });
    });

    // Add/update with keyword results
    keywordResults.forEach(result => {
      if (resultMap.has(result.id)) {
        const existing = resultMap.get(result.id);
        existing.finalScore =
          existing.semanticScore * semanticWeight +
          result.keywordScore * keywordWeight;
        existing.keywordScore = result.keywordScore;
      } else {
        resultMap.set(result.id, {
          ...result,
          finalScore: result.keywordScore * keywordWeight,
          semanticScore: 0,
          keywordScore: result.keywordScore,
          similarity: result.keywordScore,
        });
      }
    });

    return Array.from(resultMap.values()).sort(
      (a, b) => b.finalScore - a.finalScore
    );
  }

  /**
   * Get document statistics
   */
  async getStats(organizationId, projectId, knowledgeBaseId = null) {
    const vectorDB = await this.getVectorDatabase(organizationId, projectId);
    return vectorDB.getStats(
      this.buildScope(organizationId, projectId, knowledgeBaseId)
    );
  }

  /**
   * Clear all indexed data for a project KB or an isolated knowledge base
   */
  async clearIndex(organizationId, projectId, knowledgeBaseId = null) {
    console.log('🗑️ RAGService.clearIndex', {
      organizationId,
      projectId,
      knowledgeBaseId,
    });
    const vectorDB = await this.getVectorDatabase(organizationId, projectId);
    return vectorDB.clearIndex(
      this.buildScope(organizationId, projectId, knowledgeBaseId)
    );
  }

  /**
   * Delete documents by document_id
   */
  async deleteByDocumentId(
    documentId,
    organizationId,
    projectId,
    knowledgeBaseId = null
  ) {
    const vectorDB = await this.getVectorDatabase(organizationId, projectId);
    const result = await vectorDB.deleteDocument(
      documentId,
      this.buildScope(organizationId, projectId, knowledgeBaseId)
    );

    return {
      success: true,
      deleted_count: result?.deleted_count ?? null,
      document_id: documentId,
    };
  }
}

module.exports = new RAGService();
