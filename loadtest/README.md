# HireStepX Load Tests

Load testing suite using [k6](https://k6.io/) to stress-test the HireStepX API endpoints.

## Install k6

**macOS (Homebrew):**

```bash
brew install k6
```

**Other platforms:** Download from [https://k6.io/docs/get-started/installation/](https://k6.io/docs/get-started/installation/)

## Running Tests

### Smoke test (quick sanity check)

Run against staging:

```bash
k6 run --env BASE_URL=https://staging.hirestepx.com loadtest/api-stress.js
```

Run against production:

```bash
k6 run --env BASE_URL=https://hirestepx.com loadtest/api-stress.js
```

If you omit `BASE_URL`, it defaults to `https://hirestepx.com`.

### Run a single scenario

To run only the smoke test scenario (skip load and spike):

```bash
k6 run --env BASE_URL=https://staging.hirestepx.com --scenario smoke loadtest/api-stress.js
```

Similarly for `load` or `spike` scenarios.

## Scenarios

The script includes three scenarios that run sequentially:

| Scenario | VUs | Duration | Purpose |
|----------|-----|----------|---------|
| **smoke** | 1 | 30s | Quick sanity check that endpoints respond |
| **load** | 0 -> 20 -> 50 -> 0 | ~5 min | Sustained load to find performance bottlenecks |
| **spike** | 0 -> 100 -> 0 | ~50s | Sudden burst to test auto-scaling and error handling |

## Reading Results

After a run, k6 prints a summary to stdout showing:

- **http_req_duration**: Response time percentiles (p50, p95, p99)
- **http_req_failed**: Percentage of failed requests
- **errors**: Custom error rate (5xx responses)
- **question_gen_time**: How long question generation takes
- **evaluation_time**: How long evaluation takes
- **token_time**: How long token endpoints take

A JSON report is also saved to `loadtest/results/report-YYYY-MM-DD.json`.

### Thresholds

The test will fail (exit code 99) if any threshold is breached:

- 95th percentile response time > 5s
- Error rate > 10%
- Question generation p95 > 10s
- Evaluation p95 > 30s
- Token endpoints p95 > 1s

## Rate Limiting

The API has rate limiting in place. During load and spike tests, you **will** see `429 Too Many Requests` responses -- this is expected and intentional. The test checks treat 429s as acceptable (not errors). Only 5xx responses count toward the error rate.

## Results Directory

JSON reports are saved to `loadtest/results/`. This directory is git-tracked (via `.gitkeep`) but individual report files should not be committed.
