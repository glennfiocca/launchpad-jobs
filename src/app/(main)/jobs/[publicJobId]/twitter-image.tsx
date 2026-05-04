// Twitter looks at <meta name="twitter:image"> separately, but the visual
// content is identical — re-export the OG image module so there is a single
// source of truth and Next.js still sees a valid twitter-image route.
export { default, alt, size, contentType } from "./opengraph-image";
