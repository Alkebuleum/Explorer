// Verified contract records. Published records live in Firestore so every
// visitor sees them; an unpublished verification lives only in this session.
//
// Layout (doc id matches the `tokens` collection's "<chainId>:<address>" style):
//   verifiedContracts/{chainId}:{addressLower}             metadata
//   verifiedContracts/{chainId}:{addressLower}/chunks/{n}  { files: [{ path, content }] }
// Sources are chunked because a Firestore document is capped at 1 MiB. ABI and
// settings are stored as JSON strings since Firestore can't nest arrays.
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore/lite";
import { db, currentUser, isAdminUser } from "./firebase";
import { CHAIN_ID } from "./rpc";

const COLLECTION = "verifiedContracts";
const CHUNK_CHARS = 700_000; // headroom under the 1 MiB document limit

const session = new Map();
const published = new Map(); // address -> Promise<record|null>

const docId = (address) => `${CHAIN_ID}:${address.toLowerCase()}`;

// Reads a metadata doc plus its source chunks back into a record.
export async function readChunkedRecord(ref) {
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const chunks = await getDocs(collection(ref, "chunks"));
  const sources = {};
  chunks.docs
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((c) => (c.data().files || []).forEach((f) => { sources[f.path] = f.content; }));
  const { abiJson, settingsJson, ...rest } = snap.data();
  return {
    ...rest,
    abi: abiJson ? JSON.parse(abiJson) : [],
    settings: settingsJson ? JSON.parse(settingsJson) : {},
    sources,
  };
}

async function loadPublished(address) {
  const r = await readChunkedRecord(doc(db, COLLECTION, docId(address)));
  return r && { ...r, storage: "published" };
}

export async function getVerified(address) {
  const key = address.toLowerCase();
  if (!published.has(key)) {
    const p = loadPublished(key).catch((e) => {
      published.delete(key);
      console.warn("[AlkeScan] couldn't load verified contract:", e.message);
      return null;
    });
    published.set(key, p);
  }
  return (await published.get(key)) || session.get(key) || null;
}

// Keeps a fresh verification for this session (before/without publishing).
export async function saveVerified(record) {
  const stored = { ...record, storage: "session" };
  session.set(record.address.toLowerCase(), stored);
  return stored;
}

export function chunkSources(sources) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const [path, content] of Object.entries(sources)) {
    const n = path.length + content.length;
    if (n > CHUNK_CHARS) throw new Error(`Source file too large to publish: ${path}`);
    if (size + n > CHUNK_CHARS && cur.length) { chunks.push(cur); cur = []; size = 0; }
    cur.push({ path, content });
    size += n;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// Writes the record to Firestore. Needs a signed-in admin; Firestore rules
// reject anyone else.
export async function publishVerified(record) {
  const user = await currentUser();
  if (!isAdminUser(user)) throw new Error("Sign in as an AlkeScan admin to publish.");

  const ref = doc(db, COLLECTION, docId(record.address));
  const chunks = chunkSources(record.sources);
  const batch = writeBatch(db);
  // Clear chunks from any earlier publish that had more files.
  (await getDocs(collection(ref, "chunks"))).docs.forEach((d) => {
    if (Number(d.id) >= chunks.length) batch.delete(d.ref);
  });
  chunks.forEach((files, i) => batch.set(doc(ref, "chunks", String(i)), { files }));
  batch.set(ref, {
    chainId: CHAIN_ID,
    address: record.address.toLowerCase(),
    contractName: record.contractName,
    sourcePath: record.sourcePath,
    compilerVersion: record.compilerVersion,
    language: record.language,
    matchType: record.matchType,
    abiJson: JSON.stringify(record.abi),
    settingsJson: JSON.stringify(record.settings || {}),
    constructorArgs: record.constructorArgs || null,
    constructorArgsError: record.constructorArgsError || null,
    creationTx: record.creationTx || null,
    verifiedAt: record.verifiedAt,
    publishedAt: new Date().toISOString(),
    publishedBy: user.email || user.uid,
    sourceFileCount: Object.keys(record.sources).length,
    chunkCount: chunks.length,
  });
  await batch.commit();

  const stored = { ...record, storage: "published", publishedBy: user.email || user.uid };
  published.set(record.address.toLowerCase(), Promise.resolve(stored));
  session.delete(record.address.toLowerCase());
  return stored;
}
