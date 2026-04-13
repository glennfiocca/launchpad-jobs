import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

export { BUCKET as SPACES_BUCKET };
