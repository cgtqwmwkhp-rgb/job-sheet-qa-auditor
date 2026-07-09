# Live AI Integration CI

`ci-live-integration.yml` is the Phase 2.4 scaffold for live eval and drift coverage.

The `live-metrics-contract` job always runs `server/tests/contracts/liveMetricsCli.contract.test.ts` with `DATABASE_URL` set to an empty string. This keeps the default workflow path deterministic and proves the live metrics adapters can be exercised without production secrets.

The `live-eval-drift` job is non-blocking while the live gate is being established. It checks whether `DATABASE_URL` is configured, skips live work when it is absent, and runs `pnpm eval:run --mode fixtures --live` plus `pnpm drift:check --live` when the secret is available.

Once the live signal is trusted, remove `continue-on-error: true` from `live-eval-drift` and make the workflow a required check.
