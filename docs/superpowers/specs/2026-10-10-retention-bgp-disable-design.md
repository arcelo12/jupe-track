# Retention Page: Disable BGP Controls (Display Only)

Date: 2026-10-10
Scope: `frontend/src/app/settings/retention/page.tsx` only.

## Decision

User chose option 1: disable BGP controls on the retention page. Backend,
scraper, and BGP pages are unchanged. The scraper keeps collecting BGP.

## Behavior

BGP section of the retention page keeps its layout but becomes read-only:

- "BGP data retention" input: `disabled`.
- "Enable BGP scraping" toggle: `disabled`, shows current value.
- "Target BGP peers" picker: `disabled`, existing selection shown, no edits.
- "BGP Records" stat card and "Last BGP Scrape" card: unchanged, read-only.
- A one-line note in the BGP section: "BGP settings are disabled on this page."

Saved values are not altered. `enable_bgp` and `retention_days_bgp` are sent
back exactly as loaded, so saving the page does not change BGP configuration.

## Crash fix (same file)

`status.total_bgp_records.toLocaleString()` throws when the field is missing.
Use `(status.total_bgp_records ?? 0).toLocaleString()` and the same guard for
`total_interface_records`. This is required even with BGP disabled, because the
card still renders.

## Out of scope

- Scraper, backend settings, `enable_bgp` value changes.
- BGP pages and dashboard.
- Removing the BGP section.

## Testing

- Browser (real route, fixture for API): BGP inputs have `disabled` attribute.
- Save path: PATCH body still contains `enable_bgp` and `retention_days_bgp`
  equal to loaded values.
- Missing `total_bgp_records` renders "0", no page error.
- Interface section unchanged and editable.
- v1 and v2 both render with no overflow at 390px and 1280px.

## Open question

None. Lingkup 1 confirmed.
