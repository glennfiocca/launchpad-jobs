# PR2 — Resume Upload SSE Contract

Foundational contract between the resume upload UI (Agent A) and the upload
API route (Agent B). Both agents import the typed payloads from
`src/lib/profile/resume-types.ts` so the wire format has a single source of
truth.

## Endpoint

`POST /api/profile/resume`

## Request

- `Content-Type: multipart/form-data`
- Field: `resume` — a single PDF file, ≤ 8 MB.
- Authentication: standard session-cookie auth (unchanged from the current
  contract).

The request shape is identical to the existing handler — only the response
changes from one-shot JSON to a streamed SSE pipeline.

## Response

`Content-Type: text/event-stream`

The route emits one SSE event per stage in order, followed by either a
`READY` event (success) or a terminal `error` event (failure). After the
terminal event the route closes the stream.

### Stages (success path)

```
event: stage
data: {"stage":"UPLOADED","fileName":"resume.pdf","size":123456}

event: stage
data: {"stage":"PARSED","textLength":4321}

event: stage
data: {"stage":"INDEXED","extracted":{...ExtractedResumeData},"backfilled":["currentTitle","yearsExperience"]}

event: stage
data: {"stage":"MATCHED","matchCount":47}

event: stage
data: {"stage":"READY"}
```

Stage semantics:

| Stage      | Trigger                                                                      | Payload                              |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `UPLOADED` | After the multipart body is fully received and the PDF passes size + MIME.   | `fileName`, `size` (bytes)           |
| `PARSED`   | After `pdf-parse` extracts text from the buffer.                             | `textLength` (chars)                 |
| `INDEXED`  | After Haiku extraction + Zod validation + write-if-empty backfill complete.  | `extracted`, `backfilled` (col list) |
| `MATCHED`  | After the simple skills/language match-count query runs against active jobs. | `matchCount`                         |
| `READY`    | Final marker — pipeline succeeded end-to-end.                                | (none)                               |

### Error events

On any failure, the route emits exactly ONE terminal error event and closes
the stream:

```
event: error
data: {"code":"PDF_EXTRACTION_FAILED","message":"..."}
```

The `code` field is one of `ResumeUploadError["code"]` and maps 1:1 to the
`ResumeParseError` codes thrown by `src/lib/profile/resume-parser.ts`. The
UI should switch on `code` for targeted recovery copy:

| Code                     | Meaning                                                     | Recovery                                                       |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `PDF_EXTRACTION_FAILED`  | `pdf-parse` couldn't read the file (encrypted, malformed).  | Prompt user to re-export as standard PDF.                      |
| `HAIKU_CALL_FAILED`      | API/network failure after retries.                          | Soft fail — file is saved, ask user to retry parsing later.    |
| `HAIKU_INVALID_OUTPUT`   | Model returned non-JSON or failed Zod validation.           | Soft fail — file is saved, suggest manual fill.                |
| `MATCH_QUERY_FAILED`     | Match-count query blew up.                                  | Non-fatal — show "indexed" success, hide match-count badge.    |

## MATCHED stage — query

Independent of the full job-scoring rewrite in Agent C — this PR keeps the
match-count query intentionally simple so PR2 doesn't depend on PR3:

```sql
SELECT COUNT(*)
FROM "Job"
WHERE "isActive" = TRUE
  AND ("requiredLanguages" = ARRAY[]::TEXT[]
       OR "requiredLanguages" && $1::TEXT[])
  AND "searchVector" @@ plainto_tsquery('english', $2)
```

Where `$1` is the candidate's spoken-language slugs (defaults to empty
when the profile has no entries — empty `&&` is false so the `=
ARRAY[]::TEXT[]` short-circuit handles the no-requirement case) and `$2`
is the space-joined skill list from `extracted.skills`.

## Typed contract (imported from `src/lib/profile/resume-types.ts`)

```ts
export type ResumeUploadEvent =
  | { stage: "UPLOADED"; fileName: string; size: number }
  | { stage: "PARSED"; textLength: number }
  | { stage: "INDEXED"; extracted: ExtractedResumeData; backfilled: string[] }
  | { stage: "MATCHED"; matchCount: number }
  | { stage: "READY" };

export type ResumeUploadError =
  | { code: "PDF_EXTRACTION_FAILED"; message: string }
  | { code: "HAIKU_CALL_FAILED"; message: string }
  | { code: "HAIKU_INVALID_OUTPUT"; message: string }
  | { code: "MATCH_QUERY_FAILED"; message: string };
```

Both agents must import these types — do not redeclare locally.

## Out of scope for PR2

- Re-extraction on re-upload — Agent B can call `parseResume` every time;
  the existing snapshot is replaced wholesale.
- Skill / education child-table writes — locked Q2 spec keeps these as
  JSONB only; never touched by the backfill helper.
- Full match scoring — that's PR3 (Agent C).
- Sync-time language extraction for new jobs — that's PR2 Agent D's job
  inside `src/lib/greenhouse/sync.ts`.
