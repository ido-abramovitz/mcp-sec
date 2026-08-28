# Analytics measurement plan

GA4 receives page views plus the following privacy-conscious events. Form values and search text are never sent.

| Event | Meaning | Recommended GA4 key event |
| --- | --- | --- |
| `generate_lead_start` | Contact form opened | No |
| `generate_lead` | Contact form delivered successfully | Yes |
| `generate_lead_error` | Contact delivery failed | No |
| `assessment_cta_click` | Assessment CTA selected | No |
| `enterprise_cta_click` | Enterprise CTA selected | No |
| `catalog_cta_click` | Catalog CTA selected | No |
| `scanner_cta_click` | Scanner CTA selected | No |
| `catalog_search` | Catalog search after a short pause | No |
| `catalog_record_open` | Catalog result selected | No |
| `scanner_command_copy` | CLI command copied | Yes |
| `outbound_click` | Visitor left for a linked domain | No |

## One-time dashboard setup

1. In GA4 Admin, mark `generate_lead` and `scanner_command_copy` as key events.
2. Link the GA4 property to Google Search Console for `https://mcpsecurity.cloud/`.
3. Add a weekly report with organic users, landing page, search query, key-event rate, and the events above.
4. Validate events in GA4 Realtime/DebugView after deployment.
