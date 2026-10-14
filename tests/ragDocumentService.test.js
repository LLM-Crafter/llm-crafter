'use strict';

// In-memory stand-in for the RagIndexedDocument model, covering the query and
// update operators the registry protocol relies on
jest.mock('../src/models/RagIndexedDocument', () => {
  let rows = [];
  let nextId = 1;
  const defaults = {
    knowledge_base_id: null,
    status: 'pending',
    revision: 0,
    chunk_count: 0,
    chunk_capacity: 0,
    legacy_checked: false,
    content_hash: null,
    metadata: {},
    job_id: null,
    error: null,
    indexed_at: null,
    deleted_at: null,
  };
  const matches = (row, filter) =>
    Object.entries(filter).every(([key, cond]) => {
      const value = row[key] === undefined ? null : row[key];
      if (cond && typeof cond === 'object' && '$ne' in cond) {
        return value !== cond.$ne;
      }
      return value === cond;
    });
  const query = value => {
    const promise = Promise.resolve(value ? structuredClone(value) : null);
    promise.lean = () => promise;
    return promise;
  };
  const apply = (row, update) => {
    Object.assign(row, update.$set || {});
    for (const [k, v] of Object.entries(update.$inc || {})) {
      row[k] = (row[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(update.$max || {})) {
      row[k] = Math.max(row[k] || 0, v);
    }
  };
  return {
    rows: () => rows,
    reset: () => {
      rows = [];
    },
    findOne: filter => query(rows.find(r => matches(r, filter))),
    exists: async filter => (rows.some(r => matches(r, filter)) ? {} : null),
    findOneAndUpdate: (filter, update, options = {}) => {
      let row = rows.find(r => matches(r, filter));
      if (!row && options.upsert) {
        row = { _id: nextId++, ...defaults, ...filter };
        rows.push(row);
      }
      if (row) {
        apply(row, update);
      }
      return query(row);
    },
    updateOne: async (filter, update) => {
      const row = rows.find(r => matches(r, filter));
      if (row) {
        apply(row, update);
      }
    },
    deleteMany: async filter => {
      rows = rows.filter(r => !matches(r, filter));
    },
  };
});

jest.mock('../src/services/ragService', () => {
  const { MemoryVectorDB } = jest.requireActual(
    '../src/services/vectorDatabaseService'
  );
  const vectorDB = new MemoryVectorDB({});
  return {
    vectorDB,
    buildScope: (organizationId, projectId, knowledgeBaseId = null) => ({
      organization_id: organizationId,
      project_id: projectId,
      knowledge_base_id: knowledgeBaseId || null,
    }),
    getVectorDatabase: jest.fn(async () => vectorDB),
    resolveEmbeddingApiKeyId: jest.fn(async apiKeyId => apiKeyId),
    generateEmbeddings: jest.fn(async chunks => chunks.map(() => [1, 0])),
  };
});

const RagIndexedDocument = require('../src/models/RagIndexedDocument');
const ragService = require('../src/services/ragService');
const ragDocumentService = require('../src/services/ragDocumentService');
const { PineconeVectorDB } = require('../src/services/vectorDatabaseService');

const scope = {
  organizationId: 'org1',
  projectId: 'proj1',
  knowledgeBaseId: null,
};
const vectorScope = {
  organization_id: 'org1',
  project_id: 'proj1',
  knowledge_base_id: null,
};

// The payload shape the third-party integration sends to POST /rag/index
function preChunkedItems(documentId, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `doc_${documentId}_chunk_${i}`,
    content: `Context for chunk ${i}\n\nChunk text ${i}`,
    metadata: {
      type: 'document',
      document_id: documentId,
      file_name: 'handbook.pdf',
      chunk_index: i,
      total_chunks: count,
      chunk_context: `Context for chunk ${i}`,
    },
  }));
}

async function index(document) {
  const { row } = await ragDocumentService.registerRevision(scope, document, {
    skipUnchanged: false,
  });
  return ragDocumentService.indexRevision({
    ...scope,
    apiKeyId: 'key1',
    document,
    revision: row.revision,
  });
}

function storedChunks(documentId) {
  return ragService.vectorDB.documents.filter(
    d => d.document_id === documentId
  );
}

beforeEach(() => {
  RagIndexedDocument.reset();
  ragService.vectorDB.documents = [];
  ragService.generateEmbeddings.mockClear();
});

describe('pre-chunked documents from POST /rag/index', () => {
  test('are grouped by metadata.document_id and fully removed by a delete on that id', async () => {
    const [document] = ragDocumentService.groupPreChunkedItems(
      preChunkedItems('uuid-123', 3)
    );
    expect(document.document_id).toBe('uuid-123');

    const outcome = await index(document);
    expect(outcome.status).toBe('indexed');
    expect(outcome.vector_ids).toEqual([
      'uuid-123#0',
      'uuid-123#1',
      'uuid-123#2',
    ]);
    expect(storedChunks('uuid-123')).toHaveLength(3);

    const result = await ragDocumentService.deleteDocument({
      ...scope,
      documentId: 'uuid-123',
    });
    expect(result).toEqual({ found: true, deleted_count: 3 });
    expect(ragService.vectorDB.documents).toHaveLength(0);
  });

  test('embed the generated context but return only the chunk text', async () => {
    const [document] = ragDocumentService.groupPreChunkedItems(
      preChunkedItems('uuid-123', 2)
    );
    await index(document);

    const [embedded] = ragService.generateEmbeddings.mock.calls[0][0];
    expect(embedded.content).toBe('Context for chunk 0\n\nChunk text 0');

    const chunk = storedChunks('uuid-123').find(c => c.chunk_index === 0);
    expect(chunk.content).toBe('Chunk text 0');
    expect(chunk.file_name).toBe('handbook.pdf');
    expect(chunk.chunk_context).toBeUndefined();
    // Fields identical across chunks describe the document; chunk_index differs
    expect(document.metadata).toEqual({
      type: 'document',
      file_name: 'handbook.pdf',
      total_chunks: 2,
    });
  });

  test('leave generic JSON documents on the legacy path', () => {
    expect(
      ragDocumentService.groupPreChunkedItems([{ id: 'a', title: 'Generic' }])
    ).toBeNull();
  });
});

describe('document lifecycle', () => {
  const doc = (id, count) =>
    ragDocumentService.normalizeDocument(id, {
      chunks: Array.from({ length: count }, (_, i) => ({
        content: `part ${i}`,
      })),
    });

  test('re-indexing with fewer chunks removes the stale tail', async () => {
    await index(doc('d1', 5));
    await index(doc('d1', 2));

    expect(
      storedChunks('d1')
        .map(c => c.chunk_index)
        .sort()
    ).toEqual([0, 1]);
    const [row] = RagIndexedDocument.rows();
    expect(row).toMatchObject({
      status: 'indexed',
      chunk_count: 2,
      chunk_capacity: 2,
    });
  });

  test('unchanged content is not re-embedded', async () => {
    await index(doc('d1', 2));
    const { unchanged } = await ragDocumentService.registerRevision(
      scope,
      doc('d1', 2)
    );
    expect(unchanged).toBe(true);
  });

  test('a delete that lands mid-job wins over the job', async () => {
    const document = doc('d1', 3);
    const { row } = await ragDocumentService.registerRevision(scope, document);

    ragService.generateEmbeddings.mockImplementationOnce(async chunks => {
      await ragDocumentService.deleteDocument({ ...scope, documentId: 'd1' });
      return chunks.map(() => [1, 0]);
    });
    const outcome = await ragDocumentService.indexRevision({
      ...scope,
      apiKeyId: 'key1',
      document,
      revision: row.revision,
    });

    expect(outcome.status).toBe('superseded');
    expect(storedChunks('d1')).toHaveLength(0);
    expect(RagIndexedDocument.rows()[0].status).toBe('deleted');
  });

  test('an older queued revision never overwrites a newer one', async () => {
    const { row: older } = await ragDocumentService.registerRevision(
      scope,
      doc('d1', 4)
    );
    await index(doc('d1', 1));

    const outcome = await ragDocumentService.indexRevision({
      ...scope,
      apiKeyId: 'key1',
      document: doc('d1', 4),
      revision: older.revision,
    });
    expect(outcome.status).toBe('superseded');
    expect(storedChunks('d1')).toHaveLength(1);
  });

  test('a repeated delete is a no-op and an unknown document is not found', async () => {
    await index(doc('d1', 2));
    await ragDocumentService.deleteDocument({ ...scope, documentId: 'd1' });

    await expect(
      ragDocumentService.deleteDocument({ ...scope, documentId: 'd1' })
    ).resolves.toEqual({
      found: true,
      deleted_count: 0,
      already_deleted: true,
    });
    await expect(
      ragDocumentService.deleteDocument({ ...scope, documentId: 'missing' })
    ).resolves.toMatchObject({ found: false, deleted_count: 0 });
  });

  test('documents indexed before the registry are still deleted by document_id', async () => {
    await ragService.vectorDB.addDocuments([
      { id: 'legacy_0', document_id: 'old', ...vectorScope, embedding: [1, 0] },
      { id: 'legacy_1', document_id: 'old', ...vectorScope, embedding: [1, 0] },
    ]);

    await expect(
      ragDocumentService.deleteDocument({ ...scope, documentId: 'old' })
    ).resolves.toEqual({ found: true, deleted_count: 2, legacy: true });
  });

  test('first registry-backed index purges legacy chunks of the same document', async () => {
    await ragService.vectorDB.addDocuments([
      { id: 'legacy_0', document_id: 'd1', ...vectorScope, embedding: [1, 0] },
    ]);
    await index(doc('d1', 1));

    expect(storedChunks('d1').map(c => c.id)).toEqual(['project:d1#0']);
  });
});

describe('PineconeVectorDB.deleteDocumentChunks', () => {
  function pineconeWith(namespaceIndex) {
    const db = Object.create(PineconeVectorDB.prototype);
    db.index = { namespace: () => namespaceIndex };
    return db;
  }

  test('deletes listed chunk ids and ignores documents sharing the prefix', async () => {
    const namespaceIndex = {
      listPaginated: jest.fn(async () => ({
        vectors: [{ id: 'd1#0' }, { id: 'd1#1' }, { id: 'd1#x#0' }],
      })),
      deleteMany: jest.fn(async () => {}),
    };

    const result = await pineconeWith(namespaceIndex).deleteDocumentChunks(
      'd1',
      vectorScope,
      { knownCount: 2 }
    );

    expect(result).toEqual({ deleted_count: 2 });
    expect(namespaceIndex.deleteMany).toHaveBeenCalledWith(['d1#0', 'd1#1']);
  });

  test('falls back to counting known ids when listing is unsupported', async () => {
    const namespaceIndex = {
      listPaginated: jest.fn(async () => {
        throw new Error('list is not supported for pod-based indexes');
      }),
      fetch: jest.fn(async () => ({ records: { 'd1#0': {} } })),
      deleteMany: jest.fn(async () => {}),
    };

    const result = await pineconeWith(namespaceIndex).deleteDocumentChunks(
      'd1',
      vectorScope,
      { knownCount: 2 }
    );

    expect(result).toEqual({ deleted_count: 1 });
    expect(namespaceIndex.deleteMany).toHaveBeenCalledWith(['d1#0', 'd1#1']);
  });
});
