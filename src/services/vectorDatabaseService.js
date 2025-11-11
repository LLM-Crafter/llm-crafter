// Optional imports - gracefully handle missing dependencies
let weaviate;
let Pinecone;

try {
  weaviate = require('weaviate-ts-client').default;
} catch (error) {
  console.warn(
    'weaviate-ts-client not installed. Weaviate functionality will be disabled.'
  );
}

try {
  const pineconeModule = require('@pinecone-database/pinecone');
  Pinecone = pineconeModule.Pinecone;
} catch (error) {
  console.warn(
    '@pinecone-database/pinecone not installed. Pinecone functionality will be disabled.'
  );
}

/**
 * Vector Database Interface
 * Provides a unified interface for different vector database providers
 */
class VectorDatabaseInterface {
  constructor(config) {
    this.config = config;
    this.provider = config.provider; // 'weaviate', 'pinecone', 'qdrant', 'memory'
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    switch (this.provider) {
      case 'weaviate':
        await this.connectWeaviate();
        break;
      case 'pinecone':
        await this.connectPinecone();
        break;
      case 'qdrant':
        await this.connectQdrant();
        break;
      case 'memory':
        await this.connectMemory();
        break;
      default:
        throw new Error(
          `Unsupported vector database provider: ${this.provider}`
        );
    }
    this.isConnected = true;
  }

  async disconnect() {
    if (this.client && typeof this.client.close === 'function') {
      await this.client.close();
    }
    this.isConnected = false;
  }

  async connectWeaviate() {
    const { endpoint, apiKey, scheme = 'https', headers } = this.config;

    if (!endpoint) {
      throw new Error('Weaviate endpoint is required');
    }

    if (!weaviate) {
      throw new Error(
        'weaviate-ts-client is not installed. Run: npm install weaviate-ts-client'
      );
    }

    // Ensure headers is a plain object, not a Map or complex object
    const cleanHeaders = {};
    if (headers && typeof headers === 'object') {
      if (headers instanceof Map) {
        // Convert Map to plain object
        for (const [key, value] of headers.entries()) {
          if (typeof key === 'string' && typeof value === 'string') {
            cleanHeaders[key] = value;
          }
        }
      } else if (headers.constructor === Object) {
        // Copy plain object properties
        Object.keys(headers).forEach(key => {
          if (typeof headers[key] === 'string') {
            cleanHeaders[key] = headers[key];
          }
        });
      }
    }

    this.client = weaviate.client({
      scheme: scheme,
      host: endpoint.replace(/^https?:\/\//, ''),
      apiKey: apiKey ? weaviate.ApiKey(apiKey) : undefined,
      headers: cleanHeaders,
    });

    // Test connection
    try {
      await this.client.misc.metaGetter().do();
      console.log('✅ Connected to Weaviate successfully');
    } catch (error) {
      throw new Error(`Failed to connect to Weaviate: ${error.message}`);
    }
  }

  async connectPinecone() {
    const { apiKey, indexName } = this.config;

    if (!apiKey || !indexName) {
      throw new Error('Pinecone apiKey and indexName are required');
    }

    if (!Pinecone) {
      throw new Error(
        '@pinecone-database/pinecone is not installed. Run: npm install @pinecone-database/pinecone'
      );
    }

    // Initialize Pinecone client (v3+ API)
    this.client = new Pinecone({
      apiKey,
    });

    // Test connection by getting index description
    try {
      const indexDescription = await this.client.describeIndex(indexName);
      console.log('✅ Connected to Pinecone successfully');
    } catch (error) {
      throw new Error(`Failed to connect to Pinecone: ${error.message}`);
    }
  }

  async connectQdrant() {
    // Placeholder for Qdrant implementation
    throw new Error('Qdrant implementation not yet available');
  }

  async connectMemory() {
    // In-memory implementation (current system)
    this.client = new Map();
    console.log('✅ Using in-memory vector storage');
  }

  // Helper method to index a single document (calls addDocuments with array of one)
  async indexDocument(document) {
    const results = await this.addDocuments([document]);
    return results[0]; // Return the first (and only) result
  }

  // Abstract methods that should be implemented by subclasses
  async addDocuments(documents) {
    throw new Error('addDocuments method must be implemented by subclass');
  }

  async search(query, embedding, limit = 10) {
    throw new Error('search method must be implemented by subclass');
  }

  async deleteDocument(documentId) {
    throw new Error('deleteDocument method must be implemented by subclass');
  }

  async getStats(organizationId, projectId) {
    throw new Error('getStats method must be implemented by subclass');
  }

  async clearIndex(organizationId, projectId) {
    throw new Error('clearIndex method must be implemented by subclass');
  }
}

/**
 * Weaviate Vector Database Implementation
 */
class WeaviateVectorDB extends VectorDatabaseInterface {
  constructor(config) {
    super({ provider: 'weaviate', ...config });

    if (!weaviate) {
      throw new Error(
        'weaviate-ts-client is not installed. Run: npm install weaviate-ts-client'
      );
    }

    // Ensure headers is a plain object, not a Map or complex object
    const cleanHeaders = {};
    if (config.headers && typeof config.headers === 'object') {
      if (config.headers instanceof Map) {
        // Convert Map to plain object
        for (const [key, value] of config.headers.entries()) {
          if (typeof key === 'string' && typeof value === 'string') {
            cleanHeaders[key] = value;
          }
        }
      } else if (config.headers.constructor === Object) {
        // Copy plain object properties
        Object.keys(config.headers).forEach(key => {
          if (typeof config.headers[key] === 'string') {
            cleanHeaders[key] = config.headers[key];
          }
        });
      }
    }

    this.client = weaviate.client({
      scheme: config.scheme || 'http',
      host: config.endpoint?.replace(/^https?:\/\//, '') || 'localhost:8080',
      apiKey: config.apiKey ? weaviate.ApiKey(config.apiKey) : undefined,
      headers: cleanHeaders,
    });

    this.className = config.className || 'Documents';
  }

  async connect() {
    await super.connect();
    await this.ensureSchema();
  }

  async ensureSchema() {
    // Check if class exists
    try {
      await this.client.schema.classGetter().withClassName(this.className).do();
      console.log(`✅ Weaviate class '${this.className}' exists`);
    } catch (error) {
      // Class doesn't exist, create it
      console.log(`📝 Creating Weaviate class '${this.className}'`);
      await this.createSchema();
    }
  }

  async createSchema() {
    const classSchema = {
      class: this.className,
      description: 'LLM Crafter document storage for RAG',
      properties: [
        {
          name: 'content',
          dataType: ['text'],
          description: 'Document content',
        },
        {
          name: 'title',
          dataType: ['string'],
          description: 'Document title',
        },
        {
          name: 'source',
          dataType: ['string'],
          description: 'Document source',
        },
        {
          name: 'document_id',
          dataType: ['string'],
          description: 'Original document ID',
        },
        {
          name: 'chunk_index',
          dataType: ['int'],
          description: 'Chunk index within document',
        },
        {
          name: 'organization_id',
          dataType: ['string'],
          description: 'Organization ID',
        },
        {
          name: 'project_id',
          dataType: ['string'],
          description: 'Project ID',
        },
      ],
      vectorizer: 'none', // We'll provide our own vectors
    };

    await this.client.schema.classCreator().withClass(classSchema).do();
    console.log(`✅ Weaviate schema created successfully`);
  }

  async addDocuments(documents) {
    const results = [];

    for (const doc of documents) {
      try {
        const result = await this.client.data
          .creator()
          .withClassName(this.className)
          .withProperties({
            content: doc.content,
            title: doc.title || '',
            source: doc.source || '',
            document_id: doc.document_id,
            chunk_index: doc.chunk_index || 0,
            organization_id: doc.organization_id,
            project_id: doc.project_id,
          })
          .withVector(doc.embedding)
          .do();

        results.push(result.id);
      } catch (error) {
        console.error('Error adding document to Weaviate:', error);
        throw error;
      }
    }

    return results;
  }

  async search(query, embedding, limit = 10, filters = {}) {
    try {
      let searchQuery = this.client.graphql
        .get()
        .withClassName(this.className)
        .withFields(
          'content title source document_id chunk_index organization_id project_id'
        )
        .withNearVector({
          vector: embedding,
          certainty: 0.7,
        })
        .withLimit(limit);

      // Add organization/project filters if provided
      if (filters.organization_id || filters.project_id) {
        const whereConditions = [];

        if (filters.organization_id) {
          whereConditions.push({
            path: ['organization_id'],
            operator: 'Equal',
            valueString: filters.organization_id,
          });
        }

        if (filters.project_id) {
          whereConditions.push({
            path: ['project_id'],
            operator: 'Equal',
            valueString: filters.project_id,
          });
        }

        // Combine conditions with AND if both exist
        if (whereConditions.length === 1) {
          searchQuery = searchQuery.withWhere(whereConditions[0]);
        } else if (whereConditions.length === 2) {
          searchQuery = searchQuery.withWhere({
            operator: 'And',
            operands: whereConditions,
          });
        }
      }

      const result = await searchQuery.do();
      return result.data.Get[this.className] || [];
    } catch (error) {
      console.error('Error searching Weaviate:', error);
      throw error;
    }
  }

  async deleteDocument(documentId) {
    try {
      await this.client.data
        .deleter()
        .withClassName(this.className)
        .withWhere({
          path: ['document_id'],
          operator: 'Equal',
          valueText: documentId,
        })
        .do();

      return true;
    } catch (error) {
      console.error('Error deleting document from Weaviate:', error);
      throw error;
    }
  }

  async getStats(organizationId, projectId) {
    try {
      // Get total document count for this org/project
      const aggregateResult = await this.client.graphql
        .aggregate()
        .withClassName(this.className)
        .withWhere({
          operator: 'And',
          operands: [
            {
              path: ['organization_id'],
              operator: 'Equal',
              valueText: organizationId,
            },
            {
              path: ['project_id'],
              operator: 'Equal',
              valueText: projectId,
            },
          ],
        })
        .withFields('meta { count }')
        .do();

      const totalCount =
        aggregateResult?.data?.Aggregate?.[this.className]?.[0]?.meta?.count ||
        0;

      // Get sample of document IDs to calculate date range from Weaviate's internal timestamps
      let indexedRange = null;
      if (totalCount > 0) {
        try {
          const sampleResult = await this.client.graphql
            .get()
            .withClassName(this.className)
            .withWhere({
              operator: 'And',
              operands: [
                {
                  path: ['organization_id'],
                  operator: 'Equal',
                  valueText: organizationId,
                },
                {
                  path: ['project_id'],
                  operator: 'Equal',
                  valueText: projectId,
                },
              ],
            })
            .withFields('_additional { id creationTimeUnix }')
            .withLimit(100)
            .do();

          const docs = sampleResult?.data?.Get?.[this.className] || [];
          if (docs.length > 0) {
            const timestamps = docs
              .map(d => d._additional?.creationTimeUnix)
              .filter(t => t)
              .map(t => parseInt(t));

            if (timestamps.length > 0) {
              indexedRange = {
                oldest: Math.min(...timestamps),
                newest: Math.max(...timestamps),
              };
            }
          }
        } catch (timestampError) {
          // If we can't get timestamps, that's okay, just skip the range
          console.log(
            'Could not retrieve timestamp info:',
            timestampError.message
          );
        }
      }

      return {
        total_documents: totalCount,
        indexed_range: indexedRange,
      };
    } catch (error) {
      console.error('Error getting stats from Weaviate:', error);
      throw error;
    }
  }

  async clearIndex(organizationId, projectId) {
    try {
      // Get count before deletion using aggregate API directly
      let countBefore = 0;
      try {
        const aggregateResult = await this.client.graphql
          .aggregate()
          .withClassName(this.className)
          .withWhere({
            operator: 'And',
            operands: [
              {
                path: ['organization_id'],
                operator: 'Equal',
                valueText: organizationId,
              },
              {
                path: ['project_id'],
                operator: 'Equal',
                valueText: projectId,
              },
            ],
          })
          .withFields('meta { count }')
          .do();

        countBefore =
          aggregateResult?.data?.Aggregate?.[this.className]?.[0]?.meta
            ?.count || 0;
        console.log(
          `📊 Found ${countBefore} documents to delete from Weaviate`
        );
      } catch (countError) {
        console.log(
          '⚠️ Could not get count before deletion, proceeding with deletion anyway:',
          countError.message
        );
        countBefore = 0;
      }

      // Delete all documents for this org/project
      console.log(
        `🗑️ Deleting documents for org: ${organizationId}, project: ${projectId}`
      );

      // Weaviate batch deletion using the correct API
      const deleteResult = await this.client.batch
        .objectsBatchDeleter()
        .withClassName(this.className)
        .withWhere({
          operator: 'And',
          operands: [
            {
              path: ['organization_id'],
              operator: 'Equal',
              valueText: organizationId,
            },
            {
              path: ['project_id'],
              operator: 'Equal',
              valueText: projectId,
            },
          ],
        })
        .do();

      console.log('🗑️ Weaviate delete result:', deleteResult);

      // If we couldn't get the count before, try to use the delete result
      let finalCount = countBefore;
      if (countBefore === 0 && deleteResult?.results) {
        finalCount = deleteResult.results.successful || 0;
      }

      return {
        deleted_count: finalCount,
      };
    } catch (error) {
      console.error('Error clearing index from Weaviate:', error);
      throw error;
    }
  }
}

/**
 * Pinecone Vector Database Implementation
 */
class PineconeVectorDB extends VectorDatabaseInterface {
  constructor(config) {
    super({ provider: 'pinecone', ...config });

    if (!Pinecone) {
      throw new Error(
        '@pinecone-database/pinecone is not installed. Run: npm install @pinecone-database/pinecone'
      );
    }

    this.indexName = config.indexName;
    this.apiKey = config.apiKey;
  }

  async connect() {
    // Initialize Pinecone client (v3+ uses different API)
    this.client = new Pinecone({
      apiKey: this.apiKey,
    });

    // Validate that the index exists and get its configuration
    let indexInfo;
    try {
      indexInfo = await this.client.describeIndex(this.indexName);
      console.log(`✅ Pinecone index '${this.indexName}' found`);
      console.log(`   Index dimensions: ${indexInfo.dimension}`);
      console.log(`   Index metric: ${indexInfo.metric}`);
      console.log(`   Full index info:`, JSON.stringify(indexInfo, null, 2));
    } catch (error) {
      if (error.message?.includes('404')) {
        throw new Error(
          `Pinecone index '${this.indexName}' does not exist. ` +
            `Please create it first in your Pinecone dashboard or via the API.`
        );
      }
      throw new Error(`Failed to connect to Pinecone index: ${error.message}`);
    }

    // Store index dimension for validation
    this.indexDimension = indexInfo.dimension;

    // Get the index reference
    this.index = this.client.index(this.indexName);

    this.isConnected = true;
    console.log('✅ Connected to Pinecone successfully');
  }

  async addDocuments(documents) {
    // Validate embedding dimensions match the index
    if (documents.length > 0 && documents[0].embedding) {
      const embeddingDim = documents[0].embedding.length;
      if (embeddingDim !== this.indexDimension) {
        throw new Error(
          `Embedding dimension mismatch: Your embeddings have ${embeddingDim} dimensions, ` +
            `but Pinecone index '${this.indexName}' is configured for ${this.indexDimension} dimensions. ` +
            `\n\nTo fix this:\n` +
            `1. Recreate the index with dimension ${embeddingDim}, OR\n` +
            `2. Change your embedding model to match ${this.indexDimension} dimensions\n` +
            `   - For 1024 dims: Use text-embedding-3-small with dimensions parameter\n` +
            `   - For 1536 dims: Use text-embedding-3-small (default)\n` +
            `   - For 3072 dims: Use text-embedding-3-large (default)`
        );
      }
    }

    // Use project_id as namespace for data isolation
    const namespace = documents[0]?.project_id;
    if (!namespace) {
      throw new Error(
        'project_id is required for Pinecone namespace isolation'
      );
    }

    const vectors = documents.map(doc => ({
      id: doc.id || `doc_${Date.now()}_${Math.random()}`,
      values: doc.embedding,
      metadata: {
        content: doc.content,
        title: doc.title || '',
        source: doc.source || '',
        document_id: doc.document_id,
        chunk_index: doc.chunk_index || 0,
        organization_id: doc.organization_id,
        project_id: doc.project_id,
      },
    }));

    console.log(
      `  📦 Upserting ${vectors.length} vectors to Pinecone namespace: ${namespace}`
    );
    await this.index.namespace(namespace).upsert(vectors);
    return vectors.map(v => v.id);
  }

  async search(query, embedding, limit = 10, filters = {}) {
    // Validate embedding dimensions match the index
    if (embedding && embedding.length !== this.indexDimension) {
      throw new Error(
        `Embedding dimension mismatch: Query embedding has ${embedding.length} dimensions, ` +
          `but Pinecone index '${this.indexName}' is configured for ${this.indexDimension} dimensions.`
      );
    }

    // Use project_id as namespace for data isolation
    const namespace = filters.project_id;
    if (!namespace) {
      throw new Error(
        'project_id is required in filters for Pinecone namespace isolation'
      );
    }

    console.log(`  🔍 Querying Pinecone namespace: ${namespace}`);

    // Build metadata filter (exclude project_id since it's used as namespace)
    const metadataFilter = {};
    if (filters.organization_id) {
      metadataFilter.organization_id = filters.organization_id;
    }

    const queryOptions = {
      vector: embedding,
      topK: limit,
      includeMetadata: true,
    };

    // Add filter if we have metadata filters
    if (Object.keys(metadataFilter).length > 0) {
      queryOptions.filter = metadataFilter;
    }

    const results = await this.index.namespace(namespace).query(queryOptions);

    return results.matches.map(match => ({
      ...match.metadata,
      score: match.score,
    }));
  }

  async deleteDocument(documentId) {
    await this.index.delete({
      filter: { document_id: documentId },
    });
    return true;
  }

  async getStats(organizationId, projectId) {
    try {
      console.log(`  📊 Getting stats for Pinecone namespace: ${projectId}`);

      // Use describeIndexStats with filter for the namespace
      const stats = await this.index.describeIndexStats();

      // Get stats for the specific namespace
      const namespaceStats = stats.namespaces?.[projectId];

      if (!namespaceStats) {
        console.log(`  ℹ️ No data found in namespace: ${projectId}`);
        return {
          total_documents: 0,
          indexed_range: null,
        };
      }

      return {
        total_documents: namespaceStats.vectorCount || 0,
        indexed_range: null, // Pinecone doesn't provide timestamp info in stats
      };
    } catch (error) {
      console.error('Error getting stats from Pinecone:', error);
      throw error;
    }
  }

  async clearIndex(organizationId, projectId) {
    try {
      // Get count before deletion
      const statsBefore = await this.getStats(organizationId, projectId);
      const countBefore = statsBefore.total_documents;

      console.log(
        `  🗑️ Deleting all vectors from Pinecone namespace: ${projectId} (${countBefore} vectors)`
      );

      // Delete all vectors in the namespace
      await this.index.namespace(projectId).deleteAll();

      console.log(
        `  ✅ Deleted ${countBefore} vectors from namespace: ${projectId}`
      );

      return {
        deleted_count: countBefore,
      };
    } catch (error) {
      console.error('Error clearing index from Pinecone:', error);
      throw error;
    }
  }
}

/**
 * Memory Vector Database Implementation (for development/testing)
 */
class MemoryVectorDB extends VectorDatabaseInterface {
  constructor(config) {
    super({ provider: 'memory', ...config });
    this.documents = [];
    this.maxDocuments = config.maxDocuments || 10000;
  }

  async connect() {
    await super.connect();
  }

  async addDocuments(documents) {
    const results = [];

    for (const doc of documents) {
      const id = doc.id || `doc_${Date.now()}_${Math.random()}`;
      const docWithId = { ...doc, id };

      // Add to memory storage
      this.documents.push(docWithId);

      // Implement simple LRU if we exceed max documents
      if (this.documents.length > this.maxDocuments) {
        this.documents.shift(); // Remove oldest document
      }

      results.push(id);
    }

    return results;
  }

  async search(query, embedding, limit = 10) {
    // Simple cosine similarity search
    const similarities = this.documents.map(doc => {
      const similarity = this.cosineSimilarity(embedding, doc.embedding);
      return { ...doc, similarity };
    });

    // Sort by similarity and return top results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(doc => {
        const { embedding, ...result } = doc;
        return result;
      });
  }

  async deleteDocument(documentId) {
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(
      doc => doc.document_id !== documentId
    );
    return this.documents.length < initialLength;
  }

  async getStats(organizationId, projectId) {
    const docs = this.documents.filter(
      doc =>
        doc.organization_id === organizationId && doc.project_id === projectId
    );

    // Calculate date range from indexed_at field
    const indexedDates = docs
      .map(d => new Date(d.indexed_at || Date.now()).getTime())
      .filter(t => !isNaN(t));
    const dateRange =
      indexedDates.length > 0
        ? {
            oldest: Math.min(...indexedDates),
            newest: Math.max(...indexedDates),
          }
        : null;

    return {
      total_documents: docs.length,
      indexed_range: dateRange,
    };
  }

  async clearIndex(organizationId, projectId) {
    const initialCount = this.documents.length;
    this.documents = this.documents.filter(
      doc =>
        !(
          doc.organization_id === organizationId && doc.project_id === projectId
        )
    );
    const deletedCount = initialCount - this.documents.length;

    return {
      deleted_count: deletedCount,
    };
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Factory function to create vector database instances
 */
function createVectorDatabase(config) {
  switch (config.provider) {
    case 'weaviate':
      return new WeaviateVectorDB(config);
    case 'pinecone':
      return new PineconeVectorDB(config);
    case 'memory':
      return new MemoryVectorDB(config);
    default:
      throw new Error(
        `Unsupported vector database provider: ${config.provider}`
      );
  }
}

module.exports = {
  VectorDatabaseInterface,
  WeaviateVectorDB,
  PineconeVectorDB,
  MemoryVectorDB,
  createVectorDatabase,
};
