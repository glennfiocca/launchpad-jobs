# SEO Indexing — IndexNow + GSC Setup

We notify Bing/Yandex/Naver/Seznam of new and expired job URLs via the
[IndexNow protocol](https://www.bing.com/indexnow/getstarted) so they crawl
within minutes. Google does **not** participate in IndexNow; for Google we
rely on the sitemap (`/sitemap.xml`) plus a manual GSC submission.

## 1. Generate an IndexNow key

```sh
uuidgen | tr '[:upper:]' '[:lower:]'
```

Treat the output as the value of `INDEXNOW_KEY`. To rotate, generate a new
UUID and update the env var — the sentinel route (`/<KEY>.txt`) updates
automatically.

## 2. Set `INDEXNOW_KEY` in DigitalOcean

Per the global rule (`~/.claude/CLAUDE.md`), `doctl apps update` requires
the **full plaintext spec** including every existing env var's `value:`,
otherwise DO silently wipes other secrets. Update the env var via the DO
dashboard or by submitting the canonical spec at `/tmp/full-spec.yaml`
with the new value added.

## 3. Verify the sentinel file

The sentinel lives at `/indexnow-verification/<KEY>` (Next.js App Router
can't parse `[key]` as a dynamic segment when followed by a literal `.txt`
extension; the IndexNow protocol explicitly allows the keyLocation to be
any URL on the same host).

After the new env var is live:

```sh
curl https://trypipeline.ai/indexnow-verification/<KEY>
```

Expected response: 200 with the body equal to `<KEY>`. If you get 404, the
env var didn't propagate — check the DO build logs.

## 4. Google Search Console (manual, one-time)

1. Add a **domain property** for `trypipeline.ai` (covers all subdomains).
2. Verify via the DNS TXT record GSC provides — add it in the domain registrar.
3. Submit the sitemap: GSC → Sitemaps → enter `https://trypipeline.ai/sitemap.xml`.
4. Use **URL Inspection** on 5 sample job URLs to seed the crawl. Pick
   high-quality, well-known company listings to maximize quick acceptance.

## 5. Bing Webmaster Tools

Sign in at https://www.bing.com/webmasters → **Import sites from GSC**.
This pulls verification + sitemaps in one click. No additional setup needed
— IndexNow does the active part.

## 6. Monitor

- **GSC → Pages** — total indexed URL count; should climb steadily once
  the sitemap is submitted.
- **GSC → Enhancements → Job postings** — JobPosting structured-data
  validation report. Errors here block rich-result eligibility.
- **Server logs** — grep for `[indexnow]` to see batch acks. `200/202` =
  good, `422` = key file unreachable (the env var hasn't deployed yet).

## How it fires

`src/lib/ats/sync.ts` collects `newPublicJobIds` and `expiredPublicJobIds`
during each sync run, builds absolute URLs, and calls `notifyIndexNow()`
fire-and-forget. The function batches at 10,000 URLs per request (the
IndexNow limit) and swallows all errors so a flaky search-engine endpoint
never breaks the sync.
