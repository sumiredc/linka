MERGE (p:Page {url: {url: 'https://www.inkandswitch.com/local-first/', title: 'Local-first software: You own your data, in spite of the cloud', summary: 'An essay arguing that apps should keep the primary copy of user data on the device, work offline, and sync between devices, and evaluating which technologies can deliver that.', clippedAt: '2026-11-14T09:00:00Z', source: 'page'}.url})
SET p += {url: 'https://www.inkandswitch.com/local-first/', title: 'Local-first software: You own your data, in spite of the cloud', summary: 'An essay arguing that apps should keep the primary copy of user data on the device, work offline, and sync between devices, and evaluating which technologies can deliver that.', clippedAt: '2026-11-14T09:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://www.inkandswitch.com/local-first/'})
UNWIND [{key: 'localfirstsoftware', name: 'Local-first software', category: 'architecture'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}, {key: 'crdt', name: 'CRDT', category: 'sync'}, {key: 'dataownership', name: 'Data ownership', category: 'principle'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://www.inkandswitch.com/local-first/'})
UNWIND ['Martin Kleppmann', 'Adam Wiggins', 'Peter van Hardenberg', 'Mark McGranaghan'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://www.inkandswitch.com/local-first/'})
UNWIND [{id: 'https://www.inkandswitch.com/local-first/#claim-0fc54c6d619da3d2', statement: 'Cloud apps stop working when the server is unreachable or the vendor shuts the service down.', type: 'concern'}, {id: 'https://www.inkandswitch.com/local-first/#claim-fc1b9e8727cd8c5c', statement: 'When people edit the same data offline on different devices, the edits must be merged later without losing anyone\'s work.', type: 'concern'}, {id: 'https://www.inkandswitch.com/local-first/#claim-bf911a5343c34df5', statement: 'Keeping the primary copy of data on the device makes reads and writes fast because they do not wait for the network.', type: 'benefit'}, {id: 'https://www.inkandswitch.com/local-first/#claim-7c2d7a9da4d27be4', statement: 'The essay presents CRDTs as a promising foundation for local-first apps.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://www.inkandswitch.com/local-first/#claim-0fc54c6d619da3d2', concept: 'offlinesupport'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-0fc54c6d619da3d2', concept: 'dataownership'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-fc1b9e8727cd8c5c', concept: 'localfirstsoftware'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-fc1b9e8727cd8c5c', concept: 'crdt'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-bf911a5343c34df5', concept: 'localfirstsoftware'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-7c2d7a9da4d27be4', concept: 'crdt'}, {claim: 'https://www.inkandswitch.com/local-first/#claim-7c2d7a9da4d27be4', concept: 'localfirstsoftware'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'crdt', to: 'localfirstsoftware'}, {from: 'localfirstsoftware', to: 'offlinesupport'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://crdt.tech/', title: 'About CRDTs', summary: 'An overview of conflict-free replicated data types: data structures that can be updated independently on several replicas and always merge to the same result.', clippedAt: '2026-11-14T09:10:00Z', source: 'page'}.url})
SET p += {url: 'https://crdt.tech/', title: 'About CRDTs', summary: 'An overview of conflict-free replicated data types: data structures that can be updated independently on several replicas and always merge to the same result.', clippedAt: '2026-11-14T09:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://crdt.tech/'})
UNWIND [{key: 'crdt', name: 'CRDT', category: 'sync'}, {key: 'eventualconsistency', name: 'Eventual consistency', category: 'sync'}, {key: 'localfirstsoftware', name: 'Local-first software', category: 'architecture'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://crdt.tech/'})
UNWIND [{id: 'https://crdt.tech/#claim-c0e50e8ffee0cdea', statement: 'CRDTs merge concurrent updates automatically, so every replica converges to the same state without a central server deciding the order.', type: 'solution'}, {id: 'https://crdt.tech/#claim-f151302c1971f739', statement: 'A CRDT replica can be updated locally without coordinating with other replicas first.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://crdt.tech/#claim-c0e50e8ffee0cdea', concept: 'crdt'}, {claim: 'https://crdt.tech/#claim-c0e50e8ffee0cdea', concept: 'eventualconsistency'}, {claim: 'https://crdt.tech/#claim-f151302c1971f739', concept: 'crdt'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'crdt', to: 'eventualconsistency'}, {from: 'crdt', to: 'localfirstsoftware'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://docs.yjs.dev/', title: 'Yjs Docs', summary: 'Documentation for Yjs, a CRDT library that exposes shared types such as maps, arrays and text, with pluggable providers for network sync and local persistence.', clippedAt: '2026-11-14T09:20:00Z', source: 'page'}.url})
SET p += {url: 'https://docs.yjs.dev/', title: 'Yjs Docs', summary: 'Documentation for Yjs, a CRDT library that exposes shared types such as maps, arrays and text, with pluggable providers for network sync and local persistence.', clippedAt: '2026-11-14T09:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://docs.yjs.dev/'})
UNWIND [{key: 'yjs', name: 'Yjs', category: 'library'}, {key: 'crdt', name: 'CRDT', category: 'sync'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://docs.yjs.dev/'})
UNWIND [{id: 'https://docs.yjs.dev/#claim-15a61fc9df31151f', statement: 'Yjs shared types let several users edit the same document concurrently and merge their changes automatically.', type: 'solution'}, {id: 'https://docs.yjs.dev/#claim-d5467314b1599be5', statement: 'The y-indexeddb provider stores a Yjs document in IndexedDB so offline edits survive a page reload.', type: 'solution'}, {id: 'https://docs.yjs.dev/#claim-435a13323f7bb7bd', statement: 'Yjs is network-agnostic: sync runs through separate providers such as WebSocket or WebRTC.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://docs.yjs.dev/#claim-15a61fc9df31151f', concept: 'yjs'}, {claim: 'https://docs.yjs.dev/#claim-15a61fc9df31151f', concept: 'crdt'}, {claim: 'https://docs.yjs.dev/#claim-d5467314b1599be5', concept: 'yjs'}, {claim: 'https://docs.yjs.dev/#claim-d5467314b1599be5', concept: 'indexeddb'}, {claim: 'https://docs.yjs.dev/#claim-d5467314b1599be5', concept: 'offlinesupport'}, {claim: 'https://docs.yjs.dev/#claim-435a13323f7bb7bd', concept: 'yjs'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'crdt', to: 'yjs'}, {from: 'indexeddb', to: 'yjs'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', title: 'IndexedDB API - Web APIs | MDN', summary: 'Reference for IndexedDB, a transactional, asynchronous key-value database built into browsers for storing large amounts of structured data, including files and blobs.', clippedAt: '2026-11-14T09:30:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API', title: 'IndexedDB API - Web APIs | MDN', summary: 'Reference for IndexedDB, a transactional, asynchronous key-value database built into browsers for storing large amounts of structured data, including files and blobs.', clippedAt: '2026-11-14T09:30:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API'})
UNWIND [{key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'serviceworker', name: 'Service Worker', category: 'platform'}, {key: 'transaction', name: 'Transaction', category: 'database'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-6b50805df2388b5e', statement: 'IndexedDB is asynchronous and is available both in windows and in workers, so storage calls do not block page rendering.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-4c420e37c10e914a', statement: 'Because IndexedDB is available inside service workers, a service worker can save its state there and restore it after it restarts.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-7ae532f3a71e8915', statement: 'The low-level, event-based IndexedDB API is verbose, so many projects use a wrapper library.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-1056d20efb7b9da1', statement: 'Every IndexedDB read and write happens inside a transaction.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-6b50805df2388b5e', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-6b50805df2388b5e', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-4c420e37c10e914a', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-4c420e37c10e914a', concept: 'serviceworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-7ae532f3a71e8915', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-1056d20efb7b9da1', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-1056d20efb7b9da1', concept: 'transaction'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'indexeddb', to: 'transaction'}, {from: 'indexeddb', to: 'serviceworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://web.dev/articles/storage-for-the-web', title: 'Storage for the web', summary: 'A guide to choosing among browser storage mechanisms, recommending IndexedDB and the Cache Storage API and explaining quotas and persistence.', clippedAt: '2026-11-14T09:40:00Z', source: 'page'}.url})
SET p += {url: 'https://web.dev/articles/storage-for-the-web', title: 'Storage for the web', summary: 'A guide to choosing among browser storage mechanisms, recommending IndexedDB and the Cache Storage API and explaining quotas and persistence.', clippedAt: '2026-11-14T09:40:00Z', source: 'page'};
MATCH (p:Page {url: 'https://web.dev/articles/storage-for-the-web'})
UNWIND [{key: 'localstorage', name: 'localStorage', category: 'storage'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'cachestorage', name: 'Cache Storage', category: 'storage'}, {key: 'storagequota', name: 'Storage quota', category: 'constraint'}, {key: 'webworker', name: 'Web Worker', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://web.dev/articles/storage-for-the-web'})
UNWIND [{id: 'https://web.dev/articles/storage-for-the-web#claim-cdebdcabd56a5c69', statement: 'localStorage is synchronous, blocks the main thread while it reads or writes, and cannot be used from workers.', type: 'concern'}, {id: 'https://web.dev/articles/storage-for-the-web#claim-7d9f4d1459399f95', statement: 'IndexedDB and the Cache Storage API are the recommended places for app data and network resources.', type: 'fact'}, {id: 'https://web.dev/articles/storage-for-the-web#claim-0fd79088d84e19a9', statement: 'navigator.storage.estimate() reports how much of the quota an origin is using.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://web.dev/articles/storage-for-the-web#claim-cdebdcabd56a5c69', concept: 'localstorage'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-cdebdcabd56a5c69', concept: 'webworker'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-7d9f4d1459399f95', concept: 'indexeddb'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-7d9f4d1459399f95', concept: 'cachestorage'}, {claim: 'https://web.dev/articles/storage-for-the-web#claim-0fd79088d84e19a9', concept: 'storagequota'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'indexeddb', to: 'storagequota'}, {from: 'cachestorage', to: 'storagequota'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria', title: 'Storage quotas and eviction criteria - Web APIs | MDN', summary: 'Explains how much data an origin may store, how the limit is shared across storage APIs, and when browsers delete stored data.', clippedAt: '2026-11-14T09:50:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria', title: 'Storage quotas and eviction criteria - Web APIs | MDN', summary: 'Explains how much data an origin may store, how the limit is shared across storage APIs, and when browsers delete stored data.', clippedAt: '2026-11-14T09:50:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria'})
UNWIND [{key: 'storagequota', name: 'Storage quota', category: 'constraint'}, {key: 'eviction', name: 'Eviction', category: 'constraint'}, {key: 'persistentstorage', name: 'Persistent storage', category: 'capability'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'indexeddb', name: 'IndexedDB', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-1f5646c2af506ab3', statement: 'Data in best-effort storage can be evicted by the browser without asking the user when the device runs low on disk space.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-81309bc87817b4f7', statement: 'The quota is shared by IndexedDB, Cache Storage and OPFS for the same origin.', type: 'fact'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-d948c2a2b73e0946', statement: 'Eviction removes all of an origin\'s data at once rather than individual entries.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-1f5646c2af506ab3', concept: 'eviction'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-1f5646c2af506ab3', concept: 'storagequota'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-81309bc87817b4f7', concept: 'storagequota'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-81309bc87817b4f7', concept: 'indexeddb'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-81309bc87817b4f7', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-d948c2a2b73e0946', concept: 'eviction'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'eviction', to: 'storagequota'}, {from: 'eviction', to: 'persistentstorage'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist', title: 'StorageManager: persist() method - Web APIs | MDN', summary: 'Reference for navigator.storage.persist(), which asks the browser to mark an origin\'s storage as persistent.', clippedAt: '2026-11-14T10:00:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist', title: 'StorageManager: persist() method - Web APIs | MDN', summary: 'Reference for navigator.storage.persist(), which asks the browser to mark an origin\'s storage as persistent.', clippedAt: '2026-11-14T10:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist'})
UNWIND [{key: 'persistentstorage', name: 'Persistent storage', category: 'capability'}, {key: 'eviction', name: 'Eviction', category: 'constraint'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-cb5cd81e8309df27', statement: 'Calling navigator.storage.persist() asks the browser to exclude the origin\'s data from automatic eviction.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-65122ca15e885e33', statement: 'persist() resolves to a boolean that tells whether the request was granted.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-cb5cd81e8309df27', concept: 'persistentstorage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-cb5cd81e8309df27', concept: 'eviction'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-65122ca15e885e33', concept: 'persistentstorage'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'eviction', to: 'persistentstorage'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system', title: 'Origin private file system - Web APIs | MDN', summary: 'Describes the origin private file system, a per-origin file system that is invisible to the user and offers fast synchronous access from workers.', clippedAt: '2026-11-14T10:10:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system', title: 'Origin private file system - Web APIs | MDN', summary: 'Describes the origin private file system, a per-origin file system that is invisible to the user and offers fast synchronous access from workers.', clippedAt: '2026-11-14T10:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system'})
UNWIND [{key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: 'api'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8a556695cc4b7d75', statement: 'Synchronous access handles, the fastest way to read and write OPFS files, cannot be used on the main thread.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8dc20d7c2add7abf', statement: 'OPFS lets an app read and write files in place without permission prompts, which suits database engines that need random access.', type: 'benefit'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-7c2e574f5b7cef0c', statement: 'Files in OPFS are private to the origin and are not visible in the user\'s file system.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8a556695cc4b7d75', concept: 'syncaccesshandle'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8a556695cc4b7d75', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8dc20d7c2add7abf', concept: 'opfs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-7c2e574f5b7cef0c', concept: 'opfs'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'opfs', to: 'syncaccesshandle'}, {from: 'syncaccesshandle', to: 'webworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers', title: 'Using Web Workers - Web APIs | MDN', summary: 'A guide to running scripts in background threads with dedicated and shared workers and exchanging data with them through messages.', clippedAt: '2026-11-14T10:20:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers', title: 'Using Web Workers - Web APIs | MDN', summary: 'A guide to running scripts in background threads with dedicated and shared workers and exchanging data with them through messages.', clippedAt: '2026-11-14T10:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers'})
UNWIND [{key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'mainthread', name: 'Main thread', category: 'platform'}, {key: 'postmessage', name: 'postMessage', category: 'api'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-fb7931b5ced28751', statement: 'Running file and database work in a dedicated worker keeps the page responsive and gives access to APIs that are only allowed off the main thread.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-07736880e50264a8', statement: 'Workers cannot touch the DOM, so results must be sent back to the page with postMessage.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-0eb1d6962a26e52d', statement: 'Data passed with postMessage is copied with the structured clone algorithm unless it is transferred.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-fb7931b5ced28751', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-fb7931b5ced28751', concept: 'mainthread'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-fb7931b5ced28751', concept: 'syncaccesshandle'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-07736880e50264a8', concept: 'webworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-07736880e50264a8', concept: 'postmessage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-0eb1d6962a26e52d', concept: 'postmessage'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'mainthread', to: 'webworker'}, {from: 'postmessage', to: 'webworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API', title: 'Service Worker API - Web APIs | MDN', summary: 'Overview of service workers, which sit between a web app and the network to intercept requests, cache resources and enable offline use.', clippedAt: '2026-11-14T10:30:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API', title: 'Service Worker API - Web APIs | MDN', summary: 'Overview of service workers, which sit between a web app and the network to intercept requests, cache resources and enable offline use.', clippedAt: '2026-11-14T10:30:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'})
UNWIND [{key: 'serviceworker', name: 'Service Worker', category: 'platform'}, {key: 'offlinesupport', name: 'Offline support', category: 'capability'}, {key: 'cachestorage', name: 'Cache Storage', category: 'storage'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-79d5d2283b5c3a8d', statement: 'A service worker can answer requests from Cache Storage, so the app shell still loads when the network or the server is down.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-8e627ccacbb44bde', statement: 'The browser stops idle service workers, so any state kept only in a service worker\'s memory is lost.', type: 'concern'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-edb9aee8da5c4984', statement: 'Service workers run only on secure origins served over HTTPS or on localhost.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-79d5d2283b5c3a8d', concept: 'serviceworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-79d5d2283b5c3a8d', concept: 'offlinesupport'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-79d5d2283b5c3a8d', concept: 'cachestorage'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-8e627ccacbb44bde', concept: 'serviceworker'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-edb9aee8da5c4984', concept: 'serviceworker'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'cachestorage', to: 'serviceworker'}, {from: 'offlinesupport', to: 'serviceworker'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://jlongster.com/future-sql-web', title: 'A future for SQL on the web', summary: 'Introduces absurd-sql, which runs SQLite compiled to WebAssembly and persists it by storing database blocks in IndexedDB, and measures it against using IndexedDB directly.', clippedAt: '2026-11-14T10:40:00Z', source: 'page'}.url})
SET p += {url: 'https://jlongster.com/future-sql-web', title: 'A future for SQL on the web', summary: 'Introduces absurd-sql, which runs SQLite compiled to WebAssembly and persists it by storing database blocks in IndexedDB, and measures it against using IndexedDB directly.', clippedAt: '2026-11-14T10:40:00Z', source: 'page'};
MATCH (p:Page {url: 'https://jlongster.com/future-sql-web'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'indexeddb', name: 'IndexedDB', category: 'storage'}, {key: 'webassembly', name: 'WebAssembly', category: 'runtime'}, {key: 'absurdsql', name: 'absurd-sql', category: 'library'}, {key: 'transaction', name: 'Transaction', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://jlongster.com/future-sql-web'})
UNWIND ['James Long'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://jlongster.com/future-sql-web'})
UNWIND [{id: 'https://jlongster.com/future-sql-web#claim-25cb01cc90577eee', statement: 'Doing many small reads and writes as separate IndexedDB transactions makes an app\'s data layer slow.', type: 'concern'}, {id: 'https://jlongster.com/future-sql-web#claim-a8f93cfacd3ffcba', statement: 'Before persistent backends existed, SQLite compiled to Wasm kept the whole database in memory and lost changes on reload unless the app saved it manually.', type: 'concern'}, {id: 'https://jlongster.com/future-sql-web#claim-605d76fe2e4a28d3', statement: 'Treating IndexedDB as a block device for SQLite and batching block writes into few transactions is faster than using IndexedDB directly.', type: 'solution'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://jlongster.com/future-sql-web#claim-25cb01cc90577eee', concept: 'indexeddb'}, {claim: 'https://jlongster.com/future-sql-web#claim-25cb01cc90577eee', concept: 'transaction'}, {claim: 'https://jlongster.com/future-sql-web#claim-a8f93cfacd3ffcba', concept: 'sqlite'}, {claim: 'https://jlongster.com/future-sql-web#claim-a8f93cfacd3ffcba', concept: 'webassembly'}, {claim: 'https://jlongster.com/future-sql-web#claim-605d76fe2e4a28d3', concept: 'absurdsql'}, {claim: 'https://jlongster.com/future-sql-web#claim-605d76fe2e4a28d3', concept: 'sqlite'}, {claim: 'https://jlongster.com/future-sql-web#claim-605d76fe2e4a28d3', concept: 'indexeddb'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'sqlite', to: 'webassembly'}, {from: 'absurdsql', to: 'indexeddb'}, {from: 'absurdsql', to: 'sqlite'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system', title: 'SQLite Wasm in the browser backed by the Origin Private File System', summary: 'Announces the official SQLite build for WebAssembly and shows how to persist a database in the origin private file system from a worker.', clippedAt: '2026-11-14T10:50:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system', title: 'SQLite Wasm in the browser backed by the Origin Private File System', summary: 'Announces the official SQLite build for WebAssembly and shows how to persist a database in the origin private file system from a worker.', clippedAt: '2026-11-14T10:50:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'webassembly', name: 'WebAssembly', category: 'runtime'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}, {key: 'indexeddb', name: 'IndexedDB', category: null}, {key: 'syncaccesshandle', name: 'Sync access handle', category: null}, {key: 'crossoriginisolation', name: 'Cross-origin isolation', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND ['Thomas Steiner'] AS name
MERGE (a:Person {name: name})
MERGE (p)-[:AUTHORED_BY]->(a);
MATCH (p:Page {url: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system'})
UNWIND [{id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', statement: 'The official SQLite Wasm build can store its database file in OPFS, so data persists across reloads without an IndexedDB layer in between.', type: 'solution'}, {id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-69dbb10a47f20d69', statement: 'The OPFS-backed database has to be opened from a worker because it relies on synchronous file access.', type: 'fact'}, {id: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-328b4399eab4ac12', statement: 'Using the OPFS persistence requires the page to be cross-origin isolated with COOP and COEP headers.', type: 'concern'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', concept: 'sqlite'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', concept: 'opfs'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', concept: 'indexeddb'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-69dbb10a47f20d69', concept: 'opfs'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-69dbb10a47f20d69', concept: 'webworker'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-69dbb10a47f20d69', concept: 'syncaccesshandle'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-328b4399eab4ac12', concept: 'opfs'}, {claim: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-328b4399eab4ac12', concept: 'crossoriginisolation'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'opfs', to: 'sqlite'}, {from: 'sqlite', to: 'webassembly'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md', title: 'Persistent Storage Options - SQLite Wasm', summary: 'Compares the ways SQLite Wasm can persist databases in the browser, including the OPFS VFS and the OPFS SyncAccessHandle pool VFS, and their trade-offs.', clippedAt: '2026-11-14T11:00:00Z', source: 'page'}.url})
SET p += {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md', title: 'Persistent Storage Options - SQLite Wasm', summary: 'Compares the ways SQLite Wasm can persist databases in the browser, including the OPFS VFS and the OPFS SyncAccessHandle pool VFS, and their trade-offs.', clippedAt: '2026-11-14T11:00:00Z', source: 'page'};
MATCH (p:Page {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md'})
UNWIND [{key: 'sqlite', name: 'SQLite', category: 'database'}, {key: 'opfs', name: 'OPFS', category: 'storage'}, {key: 'vfs', name: 'VFS', category: 'database'}, {key: 'crossoriginisolation', name: 'Cross-origin isolation', category: 'constraint'}, {key: 'syncaccesshandle', name: 'Sync access handle', category: null}, {key: 'webassemblymemory', name: 'WebAssembly memory', category: null}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://sqlite.org/wasm/doc/trunk/persistence.md'})
UNWIND [{id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-53ef13640317e42b', statement: 'An OPFS sync access handle locks its file, so only one connection at a time can use the database and other tabs get errors.', type: 'concern'}, {id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-31b1d6dc0bcd7c4e', statement: 'The SyncAccessHandle pool VFS works without COOP and COEP headers, at the cost of supporting only one connection.', type: 'solution'}, {id: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-0fb04f6da263ce3d', statement: 'A database file on OPFS is read page by page, so the dataset does not have to fit into WebAssembly memory at once.', type: 'solution'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-53ef13640317e42b', concept: 'syncaccesshandle'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-53ef13640317e42b', concept: 'opfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-53ef13640317e42b', concept: 'sqlite'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-31b1d6dc0bcd7c4e', concept: 'vfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-31b1d6dc0bcd7c4e', concept: 'crossoriginisolation'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-31b1d6dc0bcd7c4e', concept: 'opfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-0fb04f6da263ce3d', concept: 'sqlite'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-0fb04f6da263ce3d', concept: 'opfs'}, {claim: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-0fb04f6da263ce3d', concept: 'webassemblymemory'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'sqlite', to: 'vfs'}, {from: 'opfs', to: 'vfs'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', title: 'Web Locks API - Web APIs | MDN', summary: 'Reference for the Web Locks API, which lets scripts in tabs and workers of the same origin acquire a named lock and coordinate work.', clippedAt: '2026-11-14T11:10:00Z', source: 'page'}.url})
SET p += {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', title: 'Web Locks API - Web APIs | MDN', summary: 'Reference for the Web Locks API, which lets scripts in tabs and workers of the same origin acquire a named lock and coordinate work.', clippedAt: '2026-11-14T11:10:00Z', source: 'page'};
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API'})
UNWIND [{key: 'weblocksapi', name: 'Web Locks API', category: 'api'}, {key: 'multipletabs', name: 'Multiple tabs', category: 'constraint'}, {key: 'webworker', name: 'Web Worker', category: 'platform'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API'})
UNWIND [{id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-bd7096a08e9eb33d', statement: 'A named Web Lock lets tabs elect a single owner for a shared resource while other tabs wait in a queue until it is released.', type: 'solution'}, {id: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-077503bedb297638', statement: 'A lock is released automatically when the tab or worker that holds it goes away.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-bd7096a08e9eb33d', concept: 'weblocksapi'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-bd7096a08e9eb33d', concept: 'multipletabs'}, {claim: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-077503bedb297638', concept: 'weblocksapi'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'multipletabs', to: 'weblocksapi'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
MERGE (p:Page {url: {url: 'https://v8.dev/blog/4gb-wasm-memory', title: 'Up to 4GB of memory in WebAssembly', summary: 'Explains how V8 raised the maximum WebAssembly memory from 2GB to 4GB, the limit of 32-bit addressing, and what toolchains must do to use it.', clippedAt: '2026-11-14T11:20:00Z', source: 'page'}.url})
SET p += {url: 'https://v8.dev/blog/4gb-wasm-memory', title: 'Up to 4GB of memory in WebAssembly', summary: 'Explains how V8 raised the maximum WebAssembly memory from 2GB to 4GB, the limit of 32-bit addressing, and what toolchains must do to use it.', clippedAt: '2026-11-14T11:20:00Z', source: 'page'};
MATCH (p:Page {url: 'https://v8.dev/blog/4gb-wasm-memory'})
UNWIND [{key: 'webassembly', name: 'WebAssembly', category: 'runtime'}, {key: 'webassemblymemory', name: 'WebAssembly memory', category: 'constraint'}, {key: 'v8', name: 'V8', category: 'runtime'}] AS concept
MERGE (c:Concept {key: concept.key})
SET c.name = coalesce(c.name, concept.name), c.category = coalesce(c.category, concept.category)
MERGE (p)-[:MENTIONS]->(c);
MATCH (p:Page {url: 'https://v8.dev/blog/4gb-wasm-memory'})
UNWIND [{id: 'https://v8.dev/blog/4gb-wasm-memory#claim-019ef342a0925244', statement: 'With 32-bit addressing a WebAssembly instance cannot use more than 4GB of linear memory, which caps in-memory datasets.', type: 'concern'}, {id: 'https://v8.dev/blog/4gb-wasm-memory#claim-4d339100ad9f75b7', statement: 'Linear memory can grow while the module runs but never shrinks.', type: 'fact'}] AS claim
MERGE (c:Claim {id: claim.id})
SET c.statement = claim.statement, c.type = claim.type,
  c.source = CASE WHEN c.source = 'selection' THEN c.source ELSE 'page' END
MERGE (p)-[:ASSERTS]->(c);
UNWIND [{claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-019ef342a0925244', concept: 'webassemblymemory'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-019ef342a0925244', concept: 'webassembly'}, {claim: 'https://v8.dev/blog/4gb-wasm-memory#claim-4d339100ad9f75b7', concept: 'webassemblymemory'}] AS link
MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})
MERGE (c)-[:ABOUT]->(k);
UNWIND [{from: 'webassembly', to: 'webassemblymemory'}, {from: 'v8', to: 'webassembly'}] AS link
MATCH (a:Concept {key: link.from}), (b:Concept {key: link.to})
MERGE (a)-[:RELATED_TO]->(b);
UNWIND [{solution: 'https://crdt.tech/#claim-c0e50e8ffee0cdea', concern: 'https://www.inkandswitch.com/local-first/#claim-fc1b9e8727cd8c5c'}, {solution: 'https://docs.yjs.dev/#claim-15a61fc9df31151f', concern: 'https://www.inkandswitch.com/local-first/#claim-fc1b9e8727cd8c5c'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-79d5d2283b5c3a8d', concern: 'https://www.inkandswitch.com/local-first/#claim-0fc54c6d619da3d2'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-6b50805df2388b5e', concern: 'https://web.dev/articles/storage-for-the-web#claim-cdebdcabd56a5c69'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API#claim-4c420e37c10e914a', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#claim-8e627ccacbb44bde'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist#claim-cb5cd81e8309df27', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#claim-1f5646c2af506ab3'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#claim-fb7931b5ced28751', concern: 'https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#claim-8a556695cc4b7d75'}, {solution: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', concern: 'https://jlongster.com/future-sql-web#claim-25cb01cc90577eee'}, {solution: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-29b983178b606d44', concern: 'https://jlongster.com/future-sql-web#claim-a8f93cfacd3ffcba'}, {solution: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-31b1d6dc0bcd7c4e', concern: 'https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system#claim-328b4399eab4ac12'}, {solution: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-0fb04f6da263ce3d', concern: 'https://v8.dev/blog/4gb-wasm-memory#claim-019ef342a0925244'}, {solution: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#claim-bd7096a08e9eb33d', concern: 'https://sqlite.org/wasm/doc/trunk/persistence.md#claim-53ef13640317e42b'}] AS link
MATCH (sp:Page)-[:ASSERTS]->(s:Claim {id: link.solution}),
  (cp:Page)-[:ASSERTS]->(c:Claim {id: link.concern})
WHERE s.type = 'solution' AND c.type = 'concern' AND sp.url <> cp.url
MERGE (s)-[:ADDRESSES]->(c);
