// Type declaration for the deep import `pdf-parse/lib/pdf-parse.js`. The
// upstream `@types/pdf-parse` package only declares the package root, but
// we import the deep path to sidestep a known module-init bug in
// pdf-parse's wrapper (it tries to open a sample PDF if NODE_ENV !== "test").
// We mirror the same shape as the root export.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
