# Dexmitra contract dashboard

A React and Vite interface for reading and interacting with the contract at `0x47be6b78dC569764d474515e177109Ba67D3c123` on BNB Smart Chain.

## Run locally

```sh
npm install
npm run dev
```

The app reads contract state from the BNB Smart Chain public RPC. A browser wallet is required for transactions. The payment-token address must be entered in the dashboard and confirmed as allowed by the contract before token actions are enabled.

## Secured-user storage

The 2x registration form stores its details and ID document through the `secured-users` Supabase Edge Function. The browser only uses the Supabase project URL and publishable key; never put a service-role key in the frontend or commit it to the repository. ID documents use a private Storage bucket, and only the configured contract-owner wallet can retrieve short-lived file links.

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Link this project to Supabase and apply the migration:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Configure the Edge Function secrets with the current contract owner and exact website origins:

   ```sh
   supabase secrets set SECURED_USERS_ADMIN_WALLET=OWNER_WALLET SECURED_USERS_ALLOWED_ORIGINS=https://dexmitra.com,http://localhost:5173
   ```

4. Deploy the function:

   ```sh
   supabase functions deploy secured-users
   ```

For local Edge Function testing, copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill it with local Supabase values. This file is ignored by Git; never expose or commit the service-role key.

The function verifies one-time wallet signatures for submissions and admin reads. The migration denies direct table access to browser roles and creates a private ID-document bucket. Registration for the 2x plan remains blocked until a secured-user record is successfully saved for the connected wallet. The contract itself does not enforce this requirement, so direct contract calls can bypass the dashboard gate.

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
