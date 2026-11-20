# Document references — Firestore-only storage decision

Inhub Workspace does not use Firebase Storage. The Firebase project remains on the Spark plan, and no Storage bucket, bucket IAM permissions, CORS policy, signed upload URL or `FIREBASE_STORAGE_BUCKET` environment variable is required.

## How documents are referenced

- Tasks store `referenceLinks[]` URL values on the task document.
- Work-report entries store `linkUrls[]` URL values on each entry document.
- Server-side Zod validation accepts safe HTTP(S) URLs and bounds the number of links.
- Task and report read permissions continue to govern who can see the corresponding links.
- Files themselves remain in an approved external document store (for example, an organisation-managed shared drive). Share permissions must be granted by the file owner; Inhub Workspace does not make external files public.

Only URLs are stored in Firestore. Do not store file bytes as Base64 or otherwise embed binary files in Firestore documents. Firestore is a document database, not a file-storage service.
