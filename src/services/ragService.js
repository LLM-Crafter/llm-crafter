const OpenAIService = require('./openaiService');
const ApiKey = require('../models/ApiKey');
const VectorDatabaseConfig = require('../models/VectorDatabaseConfig');
const { createVectorDatabase } = require('./vectorDatabaseService');

class RAGService {
  constructor() {
    this.vectorStore = new Map(); // Fallback in-memory store
    this.documentIndex = new Map();
    this.vectorDBInstances = new Map(); // Cache for vector DB connections
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
  async indexJsonDocuments(documents, organizationId, projectId, apiKeyId) {
    const startTime = Date.now();
    const indexed = [];

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

          for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${organizationId}_${projectId}_${Date.now()}_${i}`;
            const documentData = {
              id: chunkId,
              content: chunks[i].content,
              title: chunks[i].metadata.title || doc.title || '',
              source: chunks[i].metadata.source || doc.source || '',
              document_id: chunks[i].metadata.document_id || doc.id || chunkId,
              chunk_index: i,
              organization_id: organizationId,
              project_id: projectId,
              embedding: embeddings[i],
            };

            // Index in vector database
            await vectorDB.indexDocument(documentData);

            // Also store in fallback memory store for compatibility
            this.vectorStore.set(chunkId, {
              id: chunkId,
              embedding: embeddings[i],
              content: chunks[i].content,
              title: documentData.title,
              source: documentData.source,
              document_id: documentData.document_id,
              chunk_index: documentData.chunk_index,
              organization_id: documentData.organization_id,
              project_id: documentData.project_id,
            });

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
   * Search for relevant documents using vector similarity
   */
  async searchSimilar(
    query,
    organizationId,
    projectId,
    apiKeyId,
    options = {}
  ) {
    const {
      limit = 10,
      threshold = 0.7,
      filters = {},
      includeMetadata = true,
    } = options;

    console.log('🧠 RAGService.searchSimilar - Start');
    console.log('  Query:', query);
    console.log('  Organization ID:', organizationId);
    console.log('  Project ID:', projectId);
    console.log('  API Key ID:', apiKeyId);
    console.log('  Options:', { limit, threshold, filters });

    try {
      // Check BOTH vector database AND memory store
      console.log('  📚 Checking storage systems...');
      console.log('  📚 In-memory vector store size:', this.vectorStore.size);

      // Also check if we can get vector database instance
      let vectorDB = null;
      try {
        vectorDB = await this.getVectorDatabase(organizationId, projectId);
        console.log(
          '  💾 Vector database connection:',
          vectorDB ? 'SUCCESS' : 'FAILED'
        );
        if (vectorDB && typeof vectorDB.search === 'function') {
          console.log('  💾 Vector database has search method');
        }
      } catch (error) {
        console.log('  💾 Vector database connection error:', error.message);
      }

      // Generate embedding for query (needed for vector database search)
      let queryEmbedding = null;
      if (vectorDB && typeof vectorDB.search === 'function') {
        console.log('  🔑 Looking up API key for embeddings...');
        const apiKey = await ApiKey.findById(apiKeyId).populate('provider');
        if (!apiKey || !apiKey.is_active) {
          console.error('  ❌ Invalid or inactive API key:', apiKeyId);
          throw new Error('Invalid or inactive API key');
        }

        console.log('  � API key found, provider:', apiKey.provider.name);
        const decryptedKey = apiKey.getDecryptedKey();
        const openai = new OpenAIService(decryptedKey, apiKey.provider.name);

        console.log('  🧮 Generating embedding for query...');
        const response = await openai.createEmbedding({
          input: query,
          model: 'text-embedding-3-small',
        });
        queryEmbedding = response.data[0].embedding;
        console.log(
          '  ✅ Query embedding generated, dimensions:',
          queryEmbedding.length
        );
      }

      // Check if documents exist in vector database first
      let vectorDBResults = [];
      if (vectorDB && typeof vectorDB.search === 'function' && queryEmbedding) {
        try {
          console.log('  🔍 Attempting vector database search...');
          // Pass the actual embedding to the vector database
          vectorDBResults = await vectorDB.search(
            query,
            queryEmbedding,
            limit,
            {
              organization_id: organizationId,
              project_id: projectId,
            }
          );
          console.log('  💾 Vector DB results:', vectorDBResults.length);

          if (vectorDBResults.length > 0) {
            console.log('  ✅ Found results in vector database!');
            return {
              query,
              results: vectorDBResults.slice(0, limit).map(result => ({
                id: result.id,
                content: result.content || result.text,
                similarity: result.similarity || result.score,
                metadata: includeMetadata ? result.metadata : undefined,
              })),
              total_results: vectorDBResults.length,
              search_method: 'semantic_vectordb',
            };
          }
        } catch (vectorDBError) {
          console.log('  ⚠️ Vector DB search failed:', vectorDBError.message);
        }
      }

      // Fall back to memory store search
      const totalDocs = this.vectorStore.size;
      console.log('  📚 Total documents in memory store:', totalDocs);

      if (totalDocs === 0) {
        console.log('  ⚠️ No documents in memory store!');
        console.log(
          '  🔍 Let me check what documents might exist elsewhere...'
        );

        // Try to load documents from vector database into memory store
        if (vectorDB && typeof vectorDB.getAllDocuments === 'function') {
          try {
            const dbDocs = await vectorDB.getAllDocuments({
              organization_id: organizationId,
              project_id: projectId,
            });
            console.log('  💾 Documents in vector DB:', dbDocs.length);

            // Load them into memory store for this search
            dbDocs.forEach(doc => {
              this.vectorStore.set(doc.id, {
                id: doc.id,
                embedding: doc.embedding,
                content: doc.content || doc.text,
                metadata: {
                  organization_id: organizationId,
                  project_id: projectId,
                  ...doc.metadata,
                },
              });
            });

            console.log(
              '  🔄 Loaded',
              dbDocs.length,
              'documents into memory store'
            );
          } catch (loadError) {
            console.log(
              '  ⚠️ Failed to load from vector DB:',
              loadError.message
            );
          }
        }
      }

      // Continue with memory store search (updated total after potential loading)
      const updatedTotalDocs = this.vectorStore.size;
      console.log(
        '  📚 Updated total documents in memory store:',
        updatedTotalDocs
      );

      if (updatedTotalDocs === 0) {
        // Let's also check what documents exist across all orgs/projects
        console.log('  🔍 DEBUG: Checking all documents in memory store...');
        const allDocs = Array.from(this.vectorStore.values());
        console.log('  📊 Total documents across all orgs:', allDocs.length);

        if (allDocs.length > 0) {
          console.log('  📊 Sample document metadata:');
          allDocs.slice(0, 3).forEach((doc, i) => {
            console.log(`    Doc ${i + 1}:`, {
              id: doc.id,
              org_id: doc.metadata?.organization_id || doc.organization_id,
              project_id: doc.metadata?.project_id || doc.project_id,
              hasContent: !!doc.content,
              hasEmbedding: !!doc.embedding,
            });
          });

          // Group by org/project
          const orgProjectCounts = {};
          allDocs.forEach(doc => {
            const orgId = doc.metadata?.organization_id || doc.organization_id;
            const projId = doc.metadata?.project_id || doc.project_id;
            const key = `${orgId}/${projId}`;
            orgProjectCounts[key] = (orgProjectCounts[key] || 0) + 1;
          });

          console.log('  📊 Documents by org/project:');
          Object.entries(orgProjectCounts).forEach(([key, count]) => {
            console.log(`    ${key}: ${count} documents`);
          });
        }

        return {
          query,
          results: [],
          total_results: 0,
          search_method: 'semantic',
          debug_info: {
            memory_store_size: updatedTotalDocs,
            vector_db_available: !!vectorDB,
            vector_db_results: vectorDBResults.length,
          },
        };
      }

      // Continue with memory store semantic search
      // Generate embedding for query if not already done (for in-memory search)
      if (!queryEmbedding) {
        console.log('  🔑 Looking up API key for in-memory search...');
        const apiKey = await ApiKey.findById(apiKeyId).populate('provider');
        if (!apiKey || !apiKey.is_active) {
          console.error('  ❌ Invalid or inactive API key:', apiKeyId);
          throw new Error('Invalid or inactive API key');
        }

        console.log('  🔑 API key found, provider:', apiKey.provider.name);

        const decryptedKey = apiKey.getDecryptedKey();
        const openai = new OpenAIService(decryptedKey, apiKey.provider.name);

        console.log('  🧮 Generating embedding for query...');
        const response = await openai.createEmbedding({
          input: query,
          model: 'text-embedding-3-small',
        });
        queryEmbedding = response.data[0].embedding;
        console.log(
          '  ✅ Query embedding generated, dimensions:',
          queryEmbedding.length
        );
      }

      // Filter documents by organization/project
      console.log('  🔍 Filtering documents by org/project...');
      const orgProjectDocs = Array.from(this.vectorStore.values()).filter(
        doc => {
          const docOrgId = doc.metadata?.organization_id || doc.organization_id;
          const docProjId = doc.metadata?.project_id || doc.project_id;

          const matchesOrg = docOrgId === organizationId;
          const matchesProject = docProjId === projectId;

          if (!matchesOrg || !matchesProject) {
            console.log(
              `  🔍 Doc ${doc.id}: org=${docOrgId} (${matchesOrg}), project=${docProjId} (${matchesProject})`
            );
          }

          return matchesOrg && matchesProject;
        }
      );

      console.log(
        '  📊 Documents matching org/project:',
        orgProjectDocs.length,
        'out of',
        updatedTotalDocs
      );

      if (orgProjectDocs.length === 0) {
        console.log(
          '  ⚠️ No documents found for this organization/project after filtering!'
        );
        return {
          query,
          results: [],
          total_results: 0,
          search_method: 'semantic',
        };
      }

      // Apply additional filters and calculate similarity
      console.log('  🔍 Applying filters and calculating similarity...');
      const candidates = orgProjectDocs
        .filter(doc => {
          // Apply additional filters
          for (const [key, value] of Object.entries(filters)) {
            if (value && doc.metadata && doc.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        })
        .map(doc => ({
          ...doc,
          similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
        }))
        .filter(doc => {
          const meetsThreshold = doc.similarity >= threshold;
          if (!meetsThreshold) {
            console.log(
              `    📊 Doc ${doc.id}: similarity ${doc.similarity.toFixed(4)} < threshold ${threshold}`
            );
          }
          return meetsThreshold;
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log('  📊 Candidates after filtering:', candidates.length);
      console.log(
        '  📊 Top similarities:',
        candidates
          .slice(0, 3)
          .map(c => `${c.similarity.toFixed(4)}`)
          .join(', ')
      );

      const results = candidates.map(doc => ({
        id: doc.id,
        content: doc.content,
        similarity: doc.similarity,
        metadata: includeMetadata ? doc.metadata || {} : undefined,
      }));

      console.log('  ✅ Memory store semantic search complete');
      console.log('  📊 Final results:', results.length);

      return {
        query,
        results,
        total_results: orgProjectDocs.length,
        search_method: 'semantic',
      };
    } catch (error) {
      console.error('❌ RAGService.searchSimilar error:', error);
      console.error('❌ Error context:', {
        query,
        organizationId,
        projectId,
        apiKeyId,
      });
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
    } = options;

    try {
      // Get semantic results
      const semanticResults = await this.searchSimilar(
        query,
        organizationId,
        projectId,
        apiKeyId,
        { limit: limit * 2, threshold: 0.5 }
      );

      // Get keyword matches
      const keywordResults = this.keywordSearch(
        query,
        organizationId,
        projectId,
        { brands, models, themes, dateRange, sentiment }
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
  keywordSearch(query, organizationId, projectId, filters = {}) {
    console.log('📝 RAGService.keywordSearch - Start');
    console.log('  Query:', query);
    console.log('  Organization ID:', organizationId);
    console.log('  Project ID:', projectId);
    console.log('  Filters:', filters);

    const queryWords = query.toLowerCase().split(/\s+/);
    const { brands, models, themes, dateRange, sentiment } = filters;

    console.log('  📚 Total documents in vector store:', this.vectorStore.size);
    console.log('  🔤 Query words:', queryWords);

    const results = Array.from(this.vectorStore.values())
      .filter(doc => {
        // Basic filters
        if (
          doc.metadata.organization_id !== organizationId ||
          doc.metadata.project_id !== projectId
        ) {
          return false;
        }

        // Brand filter
        if (brands.length > 0 && !brands.includes(doc.metadata.brand)) {
          return false;
        }

        // Model filter
        if (models.length > 0 && !models.includes(doc.metadata.model)) {
          return false;
        }

        // Theme filter
        if (themes.length > 0) {
          const docThemes = doc.metadata.themes || [];
          if (!themes.some(theme => docThemes.includes(theme))) {
            return false;
          }
        }

        // Sentiment filter
        if (sentiment && doc.metadata.sentiment !== sentiment) {
          return false;
        }

        return true;
      })
      .map(doc => {
        const content = doc.content.toLowerCase();
        const title = (doc.metadata.title || '').toLowerCase();

        // Calculate keyword match score
        const contentMatches = queryWords.filter(word =>
          content.includes(word)
        ).length;
        const titleMatches = queryWords.filter(word =>
          title.includes(word)
        ).length;

        const keywordScore =
          (contentMatches + titleMatches * 2) / (queryWords.length * 3);

        return {
          ...doc,
          keywordScore,
          similarity: keywordScore, // For compatibility
        };
      })
      .filter(doc => doc.keywordScore > 0)
      .sort((a, b) => b.keywordScore - a.keywordScore);

    console.log('  📊 Keyword search results:', results.length);
    console.log(
      '  📊 Top keyword scores:',
      results
        .slice(0, 3)
        .map(r => r.keywordScore.toFixed(4))
        .join(', ')
    );
    console.log('  ✅ Keyword search complete');

    return results;
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
  async getStats(organizationId, projectId) {
    console.log('📈 RAGService.getStats - Start');
    console.log('  Organization ID:', organizationId);
    console.log('  Project ID:', projectId);

    try {
      // Try to get stats from vector database first
      const vectorDB = await this.getVectorDatabase(organizationId, projectId);

      if (vectorDB && typeof vectorDB.getStats === 'function') {
        console.log('  📊 Getting stats from vector database');
        const stats = await vectorDB.getStats(organizationId, projectId);
        console.log('  📊 Vector DB stats result:', stats);
        console.log('  ✅ Stats complete (from vector DB)');
        return stats;
      }
    } catch (error) {
      console.warn(
        '  ⚠️ Failed to get stats from vector database, falling back to memory:',
        error.message
      );
    }

    // Fallback to in-memory store
    console.log('  📊 Getting stats from in-memory store');
    console.log('  Total documents in store:', this.vectorStore.size);

    const docs = Array.from(this.vectorStore.values()).filter(
      doc =>
        doc.metadata.organization_id === organizationId &&
        doc.metadata.project_id === projectId
    );

    console.log('  Documents for org/project:', docs.length);

    // Calculate date range from indexed_at field
    const indexedDates = docs
      .map(d => new Date(d.metadata.indexed_at || Date.now()).getTime())
      .filter(t => !isNaN(t));
    const dateRange =
      indexedDates.length > 0
        ? {
            oldest: Math.min(...indexedDates),
            newest: Math.max(...indexedDates),
          }
        : null;

    const stats = {
      total_documents: docs.length,
      indexed_range: dateRange,
    };

    console.log('  📊 Memory stats result:', stats);
    console.log('  ✅ Stats complete (from memory)');

    return stats;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Clear all indexed data for an organization/project
   */
  async clearIndex(organizationId, projectId) {
    console.log('🗑️ RAGService.clearIndex - Start');
    console.log('  Organization ID:', organizationId);
    console.log('  Project ID:', projectId);

    try {
      // Try to clear from vector database first
      const vectorDB = await this.getVectorDatabase(organizationId, projectId);

      if (vectorDB && typeof vectorDB.clearIndex === 'function') {
        console.log('  🗑️ Clearing index from vector database');
        const result = await vectorDB.clearIndex(organizationId, projectId);
        console.log('  🗑️ Vector DB clear result:', result);

        // Also clear from memory store to keep it in sync
        const toDeleteFromMemory = [];
        for (const [id, doc] of this.vectorStore.entries()) {
          if (
            doc.metadata.organization_id === organizationId &&
            doc.metadata.project_id === projectId
          ) {
            toDeleteFromMemory.push(id);
          }
        }
        toDeleteFromMemory.forEach(id => this.vectorStore.delete(id));

        console.log('  ✅ Clear complete (from vector DB)');
        return result;
      }
    } catch (error) {
      console.warn(
        '  ⚠️ Failed to clear from vector database, falling back to memory:',
        error.message
      );
    }

    // Fallback to in-memory store only
    console.log('  🗑️ Clearing index from in-memory store');
    const toDelete = [];

    for (const [id, doc] of this.vectorStore.entries()) {
      if (
        doc.metadata.organization_id === organizationId &&
        doc.metadata.project_id === projectId
      ) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.vectorStore.delete(id));

    const result = {
      deleted_count: toDelete.length,
    };

    console.log('  🗑️ Memory clear result:', result);
    console.log('  ✅ Clear complete (from memory)');

    return result;
  }
}

module.exports = new RAGService();
