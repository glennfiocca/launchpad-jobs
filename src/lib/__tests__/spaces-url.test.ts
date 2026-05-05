import { describe, it, expect } from "vitest";
import { extractSpacesKey } from "../spaces-url";

const BUCKET = "pipeline-uploads";
const REGION = "nyc3";

describe("extractSpacesKey", () => {
  it("extracts the key from a direct Spaces URL", () => {
    const url = `https://${BUCKET}.${REGION}.digitaloceanspaces.com/logos/example.com.png`;
    expect(extractSpacesKey(url, BUCKET, REGION)).toBe("logos/example.com.png");
  });

  it("extracts the key from a Spaces CDN URL", () => {
    const url = `https://${BUCKET}.${REGION}.cdn.digitaloceanspaces.com/logos/manual/acme.svg`;
    expect(extractSpacesKey(url, BUCKET, REGION)).toBe("logos/manual/acme.svg");
  });

  it("returns null for logo.dev URLs", () => {
    const url = "https://img.logo.dev/example.com?token=abc&retina=true";
    expect(extractSpacesKey(url, BUCKET, REGION)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(extractSpacesKey("not a url", BUCKET, REGION)).toBeNull();
    expect(extractSpacesKey("", BUCKET, REGION)).toBeNull();
    expect(extractSpacesKey(null, BUCKET, REGION)).toBeNull();
    expect(extractSpacesKey(undefined, BUCKET, REGION)).toBeNull();
  });

  it("returns null when the bucket host doesn't match", () => {
    // Different bucket name on the same region — not ours.
    const url = `https://other-bucket.${REGION}.digitaloceanspaces.com/logos/x.png`;
    expect(extractSpacesKey(url, BUCKET, REGION)).toBeNull();
  });

  it("returns null when the path is empty (bucket root)", () => {
    const url = `https://${BUCKET}.${REGION}.digitaloceanspaces.com/`;
    expect(extractSpacesKey(url, BUCKET, REGION)).toBeNull();
  });
});
