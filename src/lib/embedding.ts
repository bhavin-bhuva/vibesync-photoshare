/**
 * Helpers for converting ArcFace embeddings between their two representations:
 *   - number[]  — used for JSON payloads sent to / received from the Python service
 *   - Buffer    — used for BYTEA storage in PostgreSQL (512 × float32 = 2048 bytes)
 */

export function embeddingToBuffer(embedding: number[]): Buffer {
  const floatArray = new Float32Array(embedding);
  return Buffer.from(floatArray.buffer);
}

export function bufferToEmbedding(buffer: Buffer): number[] {
  const floatArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 4,
  );
  return Array.from(floatArray);
}

/**
 * Cosine similarity between two embedding vectors.
 * Intended for client-side debugging and testing — production matching
 * runs inside the Python face service using numpy.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}
