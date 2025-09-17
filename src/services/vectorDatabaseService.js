// Optional imports - gracefully handle missing dependencies
let weaviate;
let PineconeStore;

try {
  weaviate = require('weaviate-ts-client').default;
} catch (error) {
  console.warn('weaviate-ts-client not installed. Weaviate functionality will be disabled.');
}

try {
  const pinecone = require('@pinecone-database/pinecone');
  PineconeStore = pinecone.PineconeStore;
} catch (error) {
  console.warn('@pinecone-database/pinecone not installed. Pinecone functionality will be disabled.');
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
        throw new Error(`Unsupported vector database provider: ${this.provider}`);
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
      throw new Error('weaviate-ts-client is not installed. Run: npm install weaviate-ts-client');
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
      headers: cleanHeaders
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
    const { apiKey, environment, indexName } = this.config;
    
    if (!apiKey || !environment || !indexName) {
      throw new Error('Pinecone apiKey, environment, and indexName are required');
    }

    this.client = new PineconeClient();
    await this.client.init({
      apiKey,
      environment
    });

    // Test connection
    try {
      const indexStats = await this.client.describe_index({ indexName });
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
}

/**
 * Weaviate Vector Database Implementation
 */
class WeaviateVectorDB extends VectorDatabaseInterface {
  constructor(config) {
    super({ provider: 'weaviate', ...config });
    
    if (!weaviate) {
      throw new Error('weaviate-ts-client is not installed. Run: npm install weaviate-ts-client');
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
      headers: cleanHeaders
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
        }
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
            project_id: doc.project_id
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
        .withFields('content title source document_id chunk_index organization_id project_id')
        .withNearVector({
          vector: embedding,
          certainty: 0.7
        })
        .withLimit(limit);

      // Add organization/project filters if provided
      if (filters.organization_id || filters.project_id) {
        const whereConditions = [];
        
        if (filters.organization_id) {
          whereConditions.push({
            path: ['organization_id'],
            operator: 'Equal',
            valueString: filters.organization_id
          });
        }
        
        if (filters.project_id) {
          whereConditions.push({
            path: ['project_id'], 
            operator: 'Equal',
            valueString: filters.project_id
          });
        }

        // Combine conditions with AND if both exist
        if (whereConditions.length === 1) {
          searchQuery = searchQuery.withWhere(whereConditions[0]);
        } else if (whereConditions.length === 2) {
          searchQuery = searchQuery.withWhere({
            operator: 'And',
            operands: whereConditions
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
          valueText: documentId
        })
        .do();
      
      return true;
    } catch (error) {
      console.error('Error deleting document from Weaviate:', error);
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
    
    if (!PineconeStore) {
      throw new Error('@pinecone-database/pinecone is not installed. Run: npm install @pinecone-database/pinecone');
    }
    
    this.indexName = config.indexName;
  }

  async connect() {
    await super.connect();
    this.index = this.client.Index(this.indexName);
  }

  async addDocuments(documents) {
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
        project_id: doc.project_id
      }
    }));

    await this.index.upsert(vectors);
    return vectors.map(v => v.id);
  }

  async search(query, embedding, limit = 10) {
    const results = await this.index.query({
      vector: embedding,
      topK: limit,
      includeMetadata: true
    });

    return results.matches.map(match => ({
      ...match.metadata,
      score: match.score
    }));
  }

  async deleteDocument(documentId) {
    await this.index.delete({
      filter: { document_id: documentId }
    });
    return true;
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
    this.documents = this.documents.filter(doc => doc.document_id !== documentId);
    return this.documents.length < initialLength;
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
      throw new Error(`Unsupported vector database provider: ${config.provider}`);
  }
}

module.exports = {
  VectorDatabaseInterface,
  WeaviateVectorDB,
  PineconeVectorDB,
  MemoryVectorDB,
  createVectorDatabase
};
