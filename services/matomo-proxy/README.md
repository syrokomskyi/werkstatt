# Matomo Proxy

First-party Cloudflare Worker proxy for RFC-0305.

The public route is `/_wg/analytics/*`. The worker only forwards:

- `GET /_wg/analytics/matomo.js`
- `GET /_wg/analytics/matomo.php`
- `POST /_wg/analytics/matomo.php`

`MATOMO_CLOUD_HOST` is deployment configuration and must be set to the upstream Matomo host without protocol, for example `example.matomo.cloud`.

See [.env.example](./.env.example) for all required environment variables.

Do not add Matomo Reporting API or admin endpoints to this proxy. Reporting, provisioning, smoke checks, and export use operator-side API clients with explicit secrets, not visitor traffic.
