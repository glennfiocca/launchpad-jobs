import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.DO_SPACES_BUCKET ?? "pipeline-uploads";
const REGION = process.env.DO_SPACES_REGION ?? "nyc3";

export function getSpacesClient(): S3Client | null {
  if (!process.env.DO_SPACES_KEY || !process.env.DO_SPACES_SECRET) return null;
  return new S3Client({
    endpoint: `https://${REGION}.digitaloceanspaces.com`,
    region: REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    },
  });
}

/**
 * Generate a presigned GET URL for a private Spaces object.
 * Returns null if the Spaces client is not configured.
 */
export async function getPresignedGetUrl(
  key: string,
  expiresIn: number = 300
): Promise<string | null> {
  const client = getSpacesClient();
  if (!client) return null;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}

/**
 * Upload a buffer as a public-read object to Spaces.
 * Returns the public CDN URL on success, null on any error.
 */
export async function uploadPublicBuffer(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const client = getSpacesClient();
  if (!client) return null;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
      })
    );
    return `https://${BUCKET}.${REGION}.digitaloceanspaces.com/${key}`;
  } catch (err) {
    console.error("uploadPublicBuffer failed:", err);
    return null;
  }
}

/**
 * Upload a buffer as a private (non-public) object to Spaces.
 * Object is only accessible via presigned URL (see getPresignedGetUrl).
 * Throws if Spaces is not configured or upload fails — caller decides recovery.
 */
export async function uploadPrivateBuffer(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ key: string; sizeBytes: number }> {
  const client = getSpacesClient();
  if (!client) throw new Error("DO Spaces is not configured");

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "private",
    })
  );

  return { key, sizeBytes: buffer.byteLength };
}

export { BUCKET as SPACES_BUCKET, REGION as SPACES_REGION };

// AWS S3 hard limit on a single DeleteObjects request. Don't change without
// reading the S3 docs — exceeding this returns a 400.
const DELETE_BATCH_SIZE = 1000;

export interface SpacesObject {
  key: string;
  size: number;
}

export interface DeleteResult {
  deleted: number;
  errors: { key: string; error: string }[];
}

/**
 * List every object under `prefix`, transparently following ContinuationToken
 * until the bucket is exhausted. Returns a flat array — caller decides how to
 * batch / process. Throws if Spaces is not configured.
 */
export async function listSpacesObjects(
  prefix: string
): Promise<SpacesObject[]> {
  const client = getSpacesClient();
  if (!client) throw new Error("DO Spaces is not configured");

  const out: SpacesObject[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const resp: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of resp.Contents ?? []) {
      // Defensive: ListObjectsV2 always returns Key, but the type allows
      // undefined. Skip anything missing a key.
      if (typeof obj.Key === "string") {
        out.push({ key: obj.Key, size: obj.Size ?? 0 });
      }
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  return out;
}

/**
 * Bulk-delete the supplied keys in batches of 1000. Doesn't throw on partial
 * failure — collects per-key errors and returns them so the caller can report
 * + retry. Throws only on hard configuration / network errors at the batch
 * level (the whole batch failed).
 */
export async function deleteSpacesObjects(
  keys: string[]
): Promise<DeleteResult> {
  const client = getSpacesClient();
  if (!client) throw new Error("DO Spaces is not configured");

  const result: DeleteResult = { deleted: 0, errors: [] };
  if (keys.length === 0) return result;

  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);

    try {
      const resp = await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            // Verbose mode: get back the list of deleted keys so we can
            // count accurately rather than guessing from input length.
            Quiet: false,
          },
        })
      );

      result.deleted += (resp.Deleted ?? []).length;

      for (const err of resp.Errors ?? []) {
        result.errors.push({
          key: err.Key ?? "<unknown>",
          error: `${err.Code ?? "Error"}: ${err.Message ?? "unknown"}`,
        });
      }
    } catch (err) {
      // Whole batch failed (auth, network, etc.). Mark each key as errored
      // rather than throwing — the caller may have already deleted earlier
      // batches and we don't want them rolling back.
      const message = err instanceof Error ? err.message : String(err);
      for (const key of batch) {
        result.errors.push({ key, error: message });
      }
    }
  }

  return result;
}
