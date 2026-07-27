# Check Warpgogol Runner

Node/Playwright backend composition for Check Warpgogol.

It consumes local queue requests from `.check-warpgogol/queue/*.request.json` and writes canonical run artifacts to `.check-warpgogol/runs/<runId>/`.

The matching product UI is `apps/check-warpgogol-com`. That app accepts external URLs through `/api/check-runs`; this runner claims the queued request, captures browser evidence, writes `report.json` and `action-pack.json`, and updates `status.json` for the UI to poll.

```sh
pnpm --filter check-warpgogol-runner run:once
pnpm --filter check-warpgogol-runner dev
```

The reusable contracts and browser capture live in packages. This backend only wires local queue/store execution.

Validate the backend layer from the workspace root:

```sh
pnpm exec site-kernel run check-warpgogol.runner.validate
pnpm exec site-kernel run services.check.run
```
