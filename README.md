# Dexmitra contract dashboard

A React and Vite interface for reading and interacting with the contract at `0x47be6b78dC569764d474515e177109Ba67D3c123` on BNB Smart Chain.

## Run locally

```sh
npm install
npm run dev
```

The app reads contract state from the BNB Smart Chain public RPC. A browser wallet is required for transactions. The payment-token address must be entered in the dashboard and confirmed as allowed by the contract before token actions are enabled.

## Verify and build

```sh
npm run lint
npm run build
```

## Deploy with GitHub Pages

Pushes to `main` run the workflow in `.github/workflows/pages.yml` and publish `dist/` to GitHub Pages. The repository must have GitHub Actions enabled for Pages builds.

The custom domain is `dexmitra.com`. In Hostinger hPanel, set the apex A records to GitHub Pages' published IPs (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`). Optionally point `www` to `gold4xxxx-hub.github.io` with a CNAME record. Remove conflicting A/AAAA records, then allow time for DNS propagation. GitHub Pages can issue HTTPS after DNS checks pass.

You can also run `npm run build` locally to verify the Pages artifact.

Audit status has not been independently verified. Contract actions can move funds and transactions are irreversible; verify the deployed address, token, and contract behavior before signing.
