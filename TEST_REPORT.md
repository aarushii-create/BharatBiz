# BharatBiz AI Test Report

Run command: `npm test`

Latest local run:

- Tests: 136 passed, 0 failed
- Total suite duration: 1149.06 ms
- Unknown tool dispatch: 0.06 ms
- Malformed query orchestration: 0.04 ms
- Bhashini timeout abort: 62.12 ms
- Voice fallback: 0.02 ms
- Missing-product database lookup: 0.01 ms
- Approved purchase-order issuance: 0.06 ms
- Product API integration: 7 checks passed
- Purchase CSV import schema: 1 check passed

The suite covers deterministic revenue, expenses, profit, inventory, reorder quantities, AI intent and tool selection, structured grounded output, unsupported questions, Tamil and English flows, voice and timeout failures, CSV validation, duplicate data, empty datasets, negative values, database failure handling, approval safety, approved actions, audit records, empty authenticated accounts, tenant isolation, persistent imports, and API-backed product flow.

Measured values above are from one local run and are not performance guarantees. Network bandwidth, long-term storage degradation, subjective voice naturalness, and live LLM-provider reliability were not measured. Voice tests use the configured simulated/fallback providers; no live provider success rate is claimed.