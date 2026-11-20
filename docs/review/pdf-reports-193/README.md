# PDF report acceptance evidence

Source: `458bca3` on real upstream parent `fbdf3efe18e692f39e510c9ed7c898bb5b1cdf72`.

786 tests, typecheck, README verification and normal Node 22 production build pass. The route trace includes both bundled TTF fonts. Production browser checks cover six native PDF downloads, A4 and Letter, private session ownership, unknown/unlinked accounts, filtered program contents, two-project batch, error recovery, filter-change cancellation, URL cleanup and mobile control bounds.

`production/browser-report.json` records actual local production HTTP and browser results. `pdfs/bbox-check.json` validates every page counter and safe text bounds for single, batch, all-program and 100-event Unicode/long-text reports. Unsupported font characters are visibly encoded as Unicode code points. Before and after UI images include both themes; dashboard data is synthetic.

Personal exports deliberately cover only the first page of GitHub public Events API, not all-time contributions. This local acceptance uses real application JWT validation and a narrow synthetic Neon/GitHub fetch transport; it does not verify a production database, physical user account, OAuth provider or deployed Vercel runtime. No auth/config source gates are bypassed.

## Reproduce

Check out the source commit and run `npm ci`, `npm test`, `npm run typecheck`, `npm run readme:check`, and `npm run build` under Node 22. Set `PROJECT_ROOT` to that checkout and `EVIDENCE_DIR` to an output directory. From the source checkout start:

```sh
SESSION_SECRET=cyrus-pdf-fixture-secret-only DATABASE_URL=postgresql://fixture:fixture@pdf-fixture.test/cyrus node --import /absolute/path/to/http-fixture.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 5381
```

In another shell run `PROJECT_ROOT=/absolute/source CYRUS_URL=http://127.0.0.1:5381 EVIDENCE_DIR=/absolute/output node /absolute/path/to/browser-check.mjs`. It requires Chrome at the macOS default path and Poppler `pdfinfo`/`pdftotext`. The test signing secret is public synthetic fixture data.
