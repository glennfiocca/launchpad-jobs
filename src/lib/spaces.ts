import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

export { BUCKET as SPACES_BUCKET };
