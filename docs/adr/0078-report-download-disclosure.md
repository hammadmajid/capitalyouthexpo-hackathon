# ADR 0078: Carry report completeness beside the download body

- **Status:** Accepted correction; affected local regressions passed; final browser acceptance pending
- **Date:** 2026-10-28
- **Requirements:** RPT-001/002; AUD-007

## Context

JSON reports contain a truncation flag and PDFs print a partial-result notice.
CSV has neither. Adding arbitrary warning lines would change its machine-readable
column structure. The existing Web attachment links cannot inspect response
metadata, and the same-origin proxy forwards only selected headers.

## Decision

Successful report responses carry `X-HSM-Report-Truncated: true|false`, derived
from the same shared report result used to render their body. Document the header
in OpenAPI and forward it through the authenticated Web proxy. Keep existing
columns, CSV encoding/formula protection, filenames and authorization.

The Web fetches the actual attachment response with same-origin credentials and
no cache. It saves that response body with the safe server filename and displays
a visible partial-result warning when the flag is true. Missing or invalid
metadata is explicitly disclosed as unknown completeness. HTTP failures produce
an error instead of a downloaded error body. Serialize requests; abort unfinished
work on unmount and release the previous object URL before another download.

## Consequences

The browser holds at most one completed download blob. Direct API consumers can
read the header without parsing CSV, while CSV files remain compatible with
existing parsers. No financial policy, query scope, persistent retention or data
migration changes. Verify complete/partial/unknown metadata, filenames, failed
authorization, formula protection, repeated clicks and resource cleanup.
Rollback is a normal revert of this isolated correction.
