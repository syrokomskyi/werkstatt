# Dev Server Guide

How to start, check, and read logs from the Astro dev server in a mission workpiece context.

## Start

```sh
pnpm astro dev --port 4321
```

Run from the workpiece directory: `missions/<mission-id>/workpiece/`.

The server runs as a background process. Wait for `ready in` in the output before probing.

## Healthcheck

```sh
curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:4321/
```

Must return `200`. If not, the server is not ready or has crashed.

## Logs

```sh
pnpm astro dev logs
```

Run from the workpiece directory. Returns JSON-formatted log entries. Filter for validation errors:

```sh
pnpm astro dev logs 2>&1 | grep "PAGE-PROPS-01"
```

## Sitemap

```sh
curl -s --max-time 10 http://localhost:4321/sitemap-content.xml | grep -oP '<loc>\K[^<]+'
curl -s --max-time 10 http://localhost:4321/sitemap-legal.xml | grep -oP '<loc>\K[^<]+'
```

## Stop

```sh
lsof -ti:4321 | xargs kill -9
```

## Caveats

- **Always use `--max-time` on curl.** 500 errors can hang curl indefinitely.
- **Port conflicts.** Kill any existing process on 4321 before starting.
- **esbuild deadlock.** If the server crashes with `all goroutines are asleep - deadlock`, restart it.
