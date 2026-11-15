MERGE (p:Page {url: {url: 'https://www.inkandswitch.com/essay/local-first/', title: 'Local-first software: You own your data, in spite of the cloud', summary: 'An essay arguing that apps should keep the primary copy of user data on the device, work offline, and sync between devices, and evaluating which technologies can deliver that.', clippedAt: '2026-11-14T09:00:00Z', source: 'page'}.url})
SET p += {url: 'https://www.inkandswitch.com/essay/local-first/', title: 'Local-first software: You own your data, in spite of the cloud', summary: 'An essay arguing that apps should keep the primary copy of user data on the device, work offline, and sync between devices, and evaluating which technologies can deliver that.', clippedAt: '2026-11-14T09:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://www.inkandswitch.com/essay/local-first/'})
UNWIND [{key: 'localfirstsoftware', name: 'Local-first software', category: 'architecture'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}, {key: 'crdt', name: 'CRDT', category: 'sync'}, {key: 'dataownership', name: 'Data ownership', category: 'principle'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://www.inkandswitch.com/essay/local-first/'})
UNWIND ['Martin Kleppmann', 'Adam Wiggins', 'Peter van Hardenberg', 'Mark McGranaghan'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://www.inkandswitch.com/essay/local-first/'})
UNWIND [{id: 'https://www.inkandswitch.com/essay/local-first/#claim-254925413f5957e8', statement: 'A cloud app cannot be used at all while its service is unavailable, for example when the device is offline.', type: 'concern'}, {id: 'https://www.inkandswitch.com/essay/local-first/#claim-6de0b51be59e4189', statement: 'If the vendor shuts the service down, the data created with the software is lost.', type: 'concern'}, {id: 'https://www.inkandswitch.com/essay/local-first/#claim-7d237de6edc97ebe', statement: 'When people modify the same data concurrently on different devices, the changes have to be merged afterwards without losing anyone\'s work.', type: 'concern'}, {id: 'https://www.inkandswitch.com/essay/local-first/#claim-56231c9de8e78350', statement: 'Local-first software never makes the user wait for a request to a server to complete.', type: 'benefit'}, {id: 'https://www.inkandswitch.com/essay/local-first/#claim-119eb36d7c17c85f', statement: 'The essay suggests CRDTs may be the foundation for collaborative software that gives users full ownership of their data.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://www.inkandswitch.com/essay/local-first/#claim-254925413f5957e8', concept: 'offlinesupport'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-6de0b51be59e4189', concept: 'dataownership'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-7d237de6edc97ebe', concept: 'localfirstsoftware'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-7d237de6edc97ebe', concept: 'crdt'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-56231c9de8e78350', concept: 'localfirstsoftware'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-119eb36d7c17c85f', concept: 'crdt'}, {claim: 'https://www.inkandswitch.com/essay/local-first/#claim-119eb36d7c17c85f', concept: 'dataownership'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'crdt', to: 'localfirstsoftware'}, {from: 'localfirstsoftware', to: 'offlinesupport'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://crdt.tech/', title: 'About CRDTs • Conflict-free Replicated Data Types', summary: 'An overview of conflict-free replicated data types: data that can be modified on any replica independently and merged automatically into a consistent state.', clippedAt: '2026-11-14T09:10:00Z', source: 'page'}.url})
SET p += {url: 'https://crdt.tech/', title: 'About CRDTs • Conflict-free Replicated Data Types', summary: 'An overview of conflict-free replicated data types: data that can be modified on any replica independently and merged automatically into a consistent state.', clippedAt: '2026-11-14T09:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://crdt.tech/'})
UNWIND [{key: 'crdt', name: 'CRDT', category: 'sync'}, {key: 'eventualconsistency', name: 'Eventual consistency', category: 'sync'}, {key: 'localfirstsoftware', name: 'Local-first software', category: 'architecture'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://crdt.tech/'})
UNWIND [{id: 'https://crdt.tech/#claim-bb9cbd10c663e7db', statement: 'With a CRDT, users can modify the data on any replica independently, and the CRDT merges the changes automatically into a consistent state.', type: 'solution'}, {id: 'https://crdt.tech/#claim-14b62f48e6056c2e', statement: 'CRDTs do not assume the use of a single server.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://crdt.tech/#claim-bb9cbd10c663e7db', concept: 'crdt'}, {claim: 'https://crdt.tech/#claim-bb9cbd10c663e7db', concept: 'eventualconsistency'}, {claim: 'https://crdt.tech/#claim-14b62f48e6056c2e', concept: 'crdt'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'crdt', to: 'eventualconsistency'}, {from: 'crdt', to: 'localfirstsoftware'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb', title: 'y-indexeddb | Yjs Docs', summary: 'Documentation for y-indexeddb, the Yjs database provider that keeps shared data in the browser\'s IndexedDB so it survives reloads and can be edited offline.', clippedAt: '2026-11-14T09:20:00Z', source: 'page'}.url})
SET p += {url: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb', title: 'y-indexeddb | Yjs Docs', summary: 'Documentation for y-indexeddb, the Yjs database provider that keeps shared data in the browser\'s IndexedDB so it survives reloads and can be edited offline.', clippedAt: '2026-11-14T09:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb'})
UNWIND [{key: 'yjs', name: 'Yjs', category: 'library'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb'})
UNWIND [{id: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-a59a4ceb0a44356b', statement: 'The y-indexeddb provider stores Yjs shared data persistently in the browser, so changes are loaded from the local database the next time the session is joined.', type: 'solution'}, {id: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-7079b589ac5c27b3', statement: 'Persisting a Yjs document with y-indexeddb makes offline editing possible.', type: 'benefit'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-a59a4ceb0a44356b', concept: 'yjs'}, {claim: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-a59a4ceb0a44356b', concept: 'indexeddb'}, {claim: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-7079b589ac5c27b3', concept: 'yjs'}, {claim: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-7079b589ac5c27b3', concept: 'offlinesupport'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'indexeddb', to: 'yjs'}, {from: 'offlinesupport', to: 'yjs'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', title: 'IndexedDB API - Web APIs | MDN', summary: 'Reference for IndexedDB, a low-level, transactional and asynchronous browser database for significant amounts of structured data, including files and blobs.', clippedAt: '2026-11-14T09:30:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', title: 'IndexedDB API - Web APIs | MDN', summary: 'Reference for IndexedDB, a low-level, transactional and asynchronous browser database for significant amounts of structured data, including files and blobs.', clippedAt: '2026-11-14T09:30:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API'})
UNWIND [{key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'transaction', name: 'Transaction', category: 'database'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-446b1586fc22053f', statement: 'IndexedDB operations run asynchronously so they do not block the application, and the API is available in Web Workers.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-fe2b76b98272c55a', statement: 'IndexedDB is a low-level API for storing significant amounts of structured data, including files and blobs.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-46021196a27edd80', statement: 'IndexedDB reads and updates data within transactions.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-446b1586fc22053f', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-446b1586fc22053f', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-fe2b76b98272c55a', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-46021196a27edd80', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-46021196a27edd80', concept: 'transaction'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'indexeddb', to: 'transaction'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://web.dev/articles/storage-for-the-web', title: 'Storage for the web | Articles | web.dev', summary: 'A guide to choosing among browser storage mechanisms, recommending Cache Storage, OPFS and IndexedDB, and explaining quotas and persistence.', clippedAt: '2026-11-14T09:40:00Z', source: 'page'}.url})
SET p += {url: 'https://web.dev/articles/storage-for-the-web', title: 'Storage for the web | Articles | web.dev', summary: 'A guide to choosing among browser storage mechanisms, recommending Cache Storage, OPFS and IndexedDB, and explaining quotas and persistence.', clippedAt: '2026-11-14T09:40:00Z', source: 'page'};
MATCH (p:Page {url: 'https://web.dev/articles/storage-for-the-web'})
UNWIND [{key: 'localstorage', name: 'localStorage', category: 'storage'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'cachestorage', name: 'Cache Storage', category: 'storage'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'storagequota', name: 'Storage quota', category: 'constraint'}, {key: 'webworker', name: 'Web Worker', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://web.dev/articles/storage-for-the-web'})
UNWIND [{id: 'https://web.dev/articles/storage-for-the-web#claim-f25d89769685f40c', statement: 'localStorage is synchronous and blocks the main thread, and it is not accessible from web workers or service workers.', type: 'concern'}, {id: 'https://web.dev/articles/storage-for-the-web#claim-19a0ffb813652dc5', statement: 'The article recommends the Cache Storage API for the network resources an app needs to load, OPFS for file-based content and IndexedDB for other data.', type: 'fact'}, {id: 'https://web.dev/articles/storage-for-the-web#claim-b95d6ce128f67ffb', statement: 'The StorageManager API reports how many bytes an origin uses and how much quota is available.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://web.dev/articles/storage-for-the-web#claim-f25d89769685f40c', concept: 'localstorage'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-f25d89769685f40c', concept: 'webworker'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-19a0ffb813652dc5', concept: 'cachestorage'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-19a0ffb813652dc5', concept: 'opfs'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-19a0ffb813652dc5', concept: 'indexeddb'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-b95d6ce128f67ffb', concept: 'storagequota'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'indexeddb', to: 'storagequota'}, {from: 'cachestorage', to: 'storagequota'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria', title: 'Storage quotas and eviction criteria - Web APIs | MDN', summary: 'Explains how much data an origin may store, how browsers manage the data of all storage APIs together, and when they delete it.', clippedAt: '2026-11-14T09:50:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria', title: 'Storage quotas and eviction criteria - Web APIs | MDN', summary: 'Explains how much data an origin may store, how browsers manage the data of all storage APIs together, and when they delete it.', clippedAt: '2026-11-14T09:50:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria'})
UNWIND [{key: 'storagequota', name: 'Storage quota', category: 'constraint'}, {key: 'eviction', name: 'Eviction', category: 'constraint'}, {key: 'persistentstorage', name: 'Persistent storage', category: 'capability'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'indexeddb', name: 'IndexedDB', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-8d32df03dc96097b', statement: 'When the browser needs space, it evicts best-effort data without interrupting the user, so an app can lose its stored data without being asked.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-831adce63603174e', statement: 'Data an origin stores with IndexedDB, the Cache API and OPFS is managed by one storage management system.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-ea4feb57e055e78b', statement: 'When an origin is evicted, all of its data is deleted at the same time, not parts of it.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-8d32df03dc96097b', concept: 'eviction'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-8d32df03dc96097b', concept: 'storagequota'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-831adce63603174e', concept: 'storagequota'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-831adce63603174e', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-831adce63603174e', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-ea4feb57e055e78b', concept: 'eviction'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'eviction', to: 'storagequota'}, {from: 'eviction', to: 'persistentstorage'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist', title: 'StorageManager: persist() method - Web APIs | MDN', summary: 'Reference for navigator.storage.persist(), which requests permission to use persistent storage for an origin.', clippedAt: '2026-11-14T10:00:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist', title: 'StorageManager: persist() method - Web APIs | MDN', summary: 'Reference for navigator.storage.persist(), which requests permission to use persistent storage for an origin.', clippedAt: '2026-11-14T10:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist'})
UNWIND [{key: 'persistentstorage', name: 'Persistent storage', category: 'capability'}, {key: 'eviction', name: 'Eviction', category: 'constraint'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-042fc87909273a9d', statement: 'navigator.storage.persist() requests persistent storage, which the browser clears only by explicit user action rather than under storage pressure.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-28ff0bce087b935f', statement: 'The browser may or may not honor a persist() request, and the returned promise resolves to whether it was granted.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-042fc87909273a9d', concept: 'persistentstorage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-042fc87909273a9d', concept: 'eviction'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-28ff0bce087b935f', concept: 'persistentstorage'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'eviction', to: 'persistentstorage'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system', title: 'Origin private file system - Web APIs | MDN', summary: 'Describes the origin private file system, a per-origin file system hidden from the user that is optimized for performance and has synchronous calls in web workers.', clippedAt: '2026-11-14T10:10:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system', title: 'Origin private file system - Web APIs | MDN', summary: 'Describes the origin private file system, a per-origin file system hidden from the user that is optimized for performance and has synchronous calls in web workers.', clippedAt: '2026-11-14T10:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system'})
UNWIND [{key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: 'api'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-d6ff4150d39a2b4b', statement: 'The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-ea5dfcabd04a5bc1', statement: 'OPFS is optimized for performance and offers in-place write access to its content.', type: 'benefit'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-fbdf32264c4a4df4', statement: 'Accessing files in OPFS requires no permission prompts or security checks.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-ad60f3d35ef9cf6d', statement: 'OPFS is private to the origin of the page and not visible to the user like the regular file system.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-d6ff4150d39a2b4b', concept: 'syncaccesshandle'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-d6ff4150d39a2b4b', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-d6ff4150d39a2b4b', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-ea5dfcabd04a5bc1', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-fbdf32264c4a4df4', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-ad60f3d35ef9cf6d', concept: 'opfs'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'opfs', to: 'syncaccesshandle'}, {from: 'syncaccesshandle', to: 'webworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers', title: 'Using Web Workers - Web APIs | MDN', summary: 'A guide to running scripts in background threads with dedicated and shared workers and exchanging data with them through messages.', clippedAt: '2026-11-14T10:20:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers', title: 'Using Web Workers - Web APIs | MDN', summary: 'A guide to running scripts in background threads with dedicated and shared workers and exchanging data with them through messages.', clippedAt: '2026-11-14T10:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers'})
UNWIND [{key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'mainthread', name: 'Main thread', category: 'platform'}, {key: 'postmessage', name: 'postMessage', category: 'api'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-2b9b9231f265ae19', statement: 'A Web Worker runs a script in a background thread, so it can perform heavy tasks without interfering with the user interface.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-01f56af79c9842bf', statement: 'A worker cannot manipulate the DOM directly, so it has to send messages back to the main script.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-686c89fa65f3f01b', statement: 'Data passed between the page and a worker is copied, not shared, unless it is a transferable object.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-5450769108220394', statement: 'Workers can use data storage mechanisms such as IndexedDB.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-2b9b9231f265ae19', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-2b9b9231f265ae19', concept: 'mainthread'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-01f56af79c9842bf', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-01f56af79c9842bf', concept: 'postmessage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-686c89fa65f3f01b', concept: 'postmessage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-5450769108220394', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-5450769108220394', concept: 'indexeddb'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'mainthread', to: 'webworker'}, {from: 'postmessage', to: 'webworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API', title: 'Service Worker API - Web APIs | MDN', summary: 'Overview of service workers, which act as proxies between a web app, the browser and the network to cache resources and enable offline experiences.', clippedAt: '2026-11-14T10:30:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API', title: 'Service Worker API - Web APIs | MDN', summary: 'Overview of service workers, which act as proxies between a web app, the browser and the network to cache resources and enable offline experiences.', clippedAt: '2026-11-14T10:30:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'})
UNWIND [{key: 'serviceworker', name: 'Service Worker', category: 'platform'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}, {key: 'cachestorage', name: 'Cache Storage', category: 'storage'}, {key: 'localstorage', name: 'localStorage', category: 'storage'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-e31fb29469d05fa3', statement: 'A service worker can put the assets an app needs into a cache when it installs and serve them from there, so the app keeps working when the network is not available.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-dee0c681ec81d5cc', statement: 'Synchronous APIs such as synchronous XHR and Web Storage cannot be used inside a service worker.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-27e2dcebf0b0117b', statement: 'Service workers are only available in secure contexts, meaning pages served over HTTPS or from localhost.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-e31fb29469d05fa3', concept: 'serviceworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-e31fb29469d05fa3', concept: 'offlinesupport'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-e31fb29469d05fa3', concept: 'cachestorage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-dee0c681ec81d5cc', concept: 'serviceworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-dee0c681ec81d5cc', concept: 'localstorage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-27e2dcebf0b0117b', concept: 'serviceworker'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'cachestorage', to: 'serviceworker'}, {from: 'offlinesupport', to: 'serviceworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://github.com/jlongster/absurd-sql', title: 'GitHub - jlongster/absurd-sql: sqlite3 in ur indexeddb (hopefully a better backend soon) · GitHub', summary: 'README of absurd-sql, a backend for sql.js that persists a SQLite database by treating IndexedDB like a disk and storing the data there in blocks.', clippedAt: '2026-11-14T10:40:00Z', source: 'page'}.url})
SET p += {url: 'https://github.com/jlongster/absurd-sql', title: 'GitHub - jlongster/absurd-sql: sqlite3 in ur indexeddb (hopefully a better backend soon) · GitHub', summary: 'README of absurd-sql, a backend for sql.js that persists a SQLite database by treating IndexedDB like a disk and storing the data there in blocks.', clippedAt: '2026-11-14T10:40:00Z', source: 'page'};
MATCH (p:Page {url: 'https://github.com/jlongster/absurd-sql'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'absurdsql', name: 'absurd-sql', category: 'library'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'crossoriginisolation', name: 'Cross-origin isolation', category: 'constraint'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://github.com/jlongster/absurd-sql'})
UNWIND ['James Long'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://github.com/jlongster/absurd-sql'})
UNWIND [{id: 'https://github.com/jlongster/absurd-sql#claim-ad012983838beb16', statement: 'Reading and writing the whole SQLite database image at once is a poor way to persist it in the browser.', type: 'concern'}, {id: 'https://github.com/jlongster/absurd-sql#claim-ee62ac5f77dfbec6', statement: 'absurd-sql treats IndexedDB like a disk and reads and writes the SQLite database in small blocks, so the database is persisted.', type: 'solution'}, {id: 'https://github.com/jlongster/absurd-sql#claim-7bd46a1301c5669b', statement: 'The project reports that absurd-sql beats the performance of using IndexedDB directly by up to 10x.', type: 'benefit'}, {id: 'https://github.com/jlongster/absurd-sql#claim-e1e6513d959cdf27', statement: 'absurd-sql relies on SharedArrayBuffer and Atomics, so the server must send COOP and COEP headers.', type: 'concern'}, {id: 'https://github.com/jlongster/absurd-sql#claim-3b69e33f2f30d7f9', statement: 'absurd-sql must run in a worker.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://github.com/jlongster/absurd-sql#claim-ad012983838beb16', concept: 'sqlite'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-ee62ac5f77dfbec6', concept: 'absurdsql'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-ee62ac5f77dfbec6', concept: 'indexeddb'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-ee62ac5f77dfbec6', concept: 'sqlite'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-7bd46a1301c5669b', concept: 'absurdsql'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-7bd46a1301c5669b', concept: 'indexeddb'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-e1e6513d959cdf27', concept: 'absurdsql'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-e1e6513d959cdf27', concept: 'crossoriginisolation'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-3b69e33f2f30d7f9', concept: 'absurdsql'}, {claim: 'https://github.com/jlongster/absurd-sql#claim-3b69e33f2f30d7f9', concept: 'webworker'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'absurdsql', to: 'indexeddb'}, {from: 'absurdsql', to: 'sqlite'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system', title: 'SQLite Wasm in the browser backed by the Origin Private File System | Blog | Chrome for Developers', summary: 'Announces the official SQLite build for WebAssembly with an origin private file system persistence backend, offered as the replacement for Web SQL.', clippedAt: '2026-11-14T10:50:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system', title: 'SQLite Wasm in the browser backed by the Origin Private File System | Blog | Chrome for Developers', summary: 'Announces the official SQLite build for WebAssembly with an origin private file system persistence backend, offered as the replacement for Web SQL.', clippedAt: '2026-11-14T10:50:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'webassembly', name: 'WebAssembly', category: 'runtime'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'crossoriginisolation', name: 'Cross-origin isolation', category: 'constraint'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: null}, {key: 'mainthread', name: 'Main thread', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND ['Thomas Steiner'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND [{id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-dd2b006fc3157301', statement: 'SQLite Wasm with the OPFS persistence backend keeps a SQLite database in the origin private file system and is offered as the replacement for Web SQL.', type: 'solution'}, {id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-d2aeda3b01514303', statement: 'The library sets up the worker needed for synchronous OPFS access itself, so it can be used right from the main thread.', type: 'solution'}, {id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-8e557f80253b0083', statement: 'The OPFS persistence backend depends on SharedArrayBuffer, so the page must be served with COOP and COEP headers.', type: 'concern'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-dd2b006fc3157301', concept: 'sqlite'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-dd2b006fc3157301', concept: 'webassembly'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-dd2b006fc3157301', concept: 'opfs'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-d2aeda3b01514303', concept: 'webworker'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-d2aeda3b01514303', concept: 'syncaccesshandle'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-d2aeda3b01514303', concept: 'mainthread'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-8e557f80253b0083', concept: 'opfs'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-8e557f80253b0083', concept: 'crossoriginisolation'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'opfs', to: 'sqlite'}, {from: 'sqlite', to: 'webassembly'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md', title: 'Persistent Storage Options', summary: 'Compares the ways SQLite Wasm can persist databases in the browser, including kvvfs, the OPFS VFS and the opfs-sahpool VFS, and their trade-offs.', clippedAt: '2026-11-14T11:00:00Z', source: 'page'}.url})
SET p += {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md', title: 'Persistent Storage Options', summary: 'Compares the ways SQLite Wasm can persist databases in the browser, including kvvfs, the OPFS VFS and the opfs-sahpool VFS, and their trade-offs.', clippedAt: '2026-11-14T11:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'vfs', name: 'VFS', category: 'database'}, {key: 'crossoriginisolation', name: 'Cross-origin isolation', category: 'constraint'}, {key: 'multipletabs', name: 'Multiple tabs', category: 'constraint'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: null}, {key: 'localstorage', name: 'localStorage', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md'})
UNWIND [{id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-b5aa4c647a1e5d1e', statement: 'A sync access handle locks its OPFS file exclusively, so tabs contend for the database and can get SQLITE_BUSY or locking errors.', type: 'concern'}, {id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', statement: 'The opfs-sahpool VFS does not require COOP and COEP headers, but it does not support multiple simultaneous connections to the same database.', type: 'solution'}, {id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-ec21f4385d1e1518', statement: 'The kvvfs backend keeps databases in localStorage or sessionStorage, whose limits are small, typically about 5MB.', type: 'concern'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-b5aa4c647a1e5d1e', concept: 'syncaccesshandle'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-b5aa4c647a1e5d1e', concept: 'multipletabs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-b5aa4c647a1e5d1e', concept: 'sqlite'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', concept: 'vfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', concept: 'crossoriginisolation'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', concept: 'opfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-ec21f4385d1e1518', concept: 'vfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-ec21f4385d1e1518', concept: 'localstorage'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'sqlite', to: 'vfs'}, {from: 'opfs', to: 'vfs'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', title: 'Web Locks API - Web APIs | MDN', summary: 'Reference for the Web Locks API, which lets an app running in several tabs or workers of the same origin acquire named locks to coordinate work and the use of resources.', clippedAt: '2026-11-14T11:10:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', title: 'Web Locks API - Web APIs | MDN', summary: 'Reference for the Web Locks API, which lets an app running in several tabs or workers of the same origin acquire named locks to coordinate work and the use of resources.', clippedAt: '2026-11-14T11:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API'})
UNWIND [{key: 'weblocksapi', name: 'Web Locks API', category: 'api'}, {key: 'multipletabs', name: 'Multiple tabs', category: 'constraint'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'indexeddb', name: 'IndexedDB', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-0184e8d035889e32', statement: 'Web Locks let tabs and workers of the same origin coordinate the use of a resource: while one holds a lock, other requests for it are queued until it is released.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-b1b2e56e8d5243cd', statement: 'With the leader election pattern, only the tab that acquires the lock syncs data between the network and IndexedDB.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-a182b5fa06dd8feb', statement: 'A lock is released automatically when the callback that holds it completes.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-0184e8d035889e32', concept: 'weblocksapi'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-0184e8d035889e32', concept: 'multipletabs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-b1b2e56e8d5243cd', concept: 'weblocksapi'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-b1b2e56e8d5243cd', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-a182b5fa06dd8feb', concept: 'weblocksapi'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'multipletabs', to: 'weblocksapi'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://v8.dev/blog/4gb-wasm-memory', title: 'Up to 4GB of memory in WebAssembly · V8', summary: 'Explains that V8 raised the maximum WebAssembly memory from 2GB to 4GB, the most that 32-bit pointers can address, and how toolchains let programs use it.', clippedAt: '2026-11-14T11:20:00Z', source: 'page'}.url})
SET p += {url: 'https://v8.dev/blog/4gb-wasm-memory', title: 'Up to 4GB of memory in WebAssembly · V8', summary: 'Explains that V8 raised the maximum WebAssembly memory from 2GB to 4GB, the most that 32-bit pointers can address, and how toolchains let programs use it.', clippedAt: '2026-11-14T11:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://v8.dev/blog/4gb-wasm-memory'})
UNWIND [{key: 'webassembly', name: 'WebAssembly', category: 'runtime'}, {key: 'webassemblymemory', name: 'WebAssembly memory', category: 'constraint'}, {key: 'v8', name: 'V8', category: 'runtime'}, {key: 'emscripten', name: 'Emscripten', category: 'toolchain'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://v8.dev/blog/4gb-wasm-memory'})
UNWIND ['Andreas Haas', 'Jakob Kummerow', 'Alon Zakai'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://v8.dev/blog/4gb-wasm-memory'})
UNWIND [{id: 'https://v8.dev/blog/4gb-wasm-memory#claim-7c2f29295face06f', statement: '4GB is the largest amount of memory possible with 32-bit pointers, so a WebAssembly program cannot hold more data than that in memory.', type: 'concern'}, {id: 'https://v8.dev/blog/4gb-wasm-memory#claim-04720733ceabe1b8', statement: 'The 4GB limit is up from the previous limit of 2GB.', type: 'fact'}, {id: 'https://v8.dev/blog/4gb-wasm-memory#claim-4e5ca8ddafc375a5', statement: 'Building with Emscripten\'s ALLOW_MEMORY_GROWTH and MAXIMUM_MEMORY=4GB lets a program start small and grow its memory up to 4GB.', type: 'solution'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-7c2f29295face06f', concept: 'webassemblymemory'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-7c2f29295face06f', concept: 'webassembly'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-04720733ceabe1b8', concept: 'webassemblymemory'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-04720733ceabe1b8', concept: 'v8'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-4e5ca8ddafc375a5', concept: 'emscripten'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-4e5ca8ddafc375a5', concept: 'webassemblymemory'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'webassembly', to: 'webassemblymemory'}, {from: 'v8', to: 'webassembly'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
UNWIND [{solution: 'https://crdt.tech/#claim-bb9cbd10c663e7db', concern: 'https://www.inkandswitch.com/essay/local-first/#claim-7d237de6edc97ebe'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-e31fb29469d05fa3', concern: 'https://www.inkandswitch.com/essay/local-first/#claim-254925413f5957e8'}, {solution: 'https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb#claim-a59a4ceb0a44356b', concern: 'https://www.inkandswitch.com/essay/local-first/#claim-6de0b51be59e4189'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-446b1586fc22053f', concern: 'https://web.dev/articles/storage-for-the-web#claim-f25d89769685f40c'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-446b1586fc22053f', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-dee0c681ec81d5cc'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-042fc87909273a9d', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-8d32df03dc96097b'}, {solution: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-d2aeda3b01514303', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-d6ff4150d39a2b4b'}, {solution: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', concern: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-8e557f80253b0083'}, {solution: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-33aadd9d995d9976', concern: 'https://github.com/jlongster/absurd-sql#claim-e1e6513d959cdf27'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-0184e8d035889e32', concern: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-b5aa4c647a1e5d1e'}] AS link
MATCH (sp:Page)-[:ASSERTS]->(s:Claim {id: link.solution}),
  (cp:Page)-[:ASSERTS]->(c:Claim {id: link.concern})
WHERE s.type = 'solution' AND c.type = 'concern' AND sp.url <> cp.url
MERGE (s)-[:ADDRESSES]->(c);
