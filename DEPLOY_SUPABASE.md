# Supabase Deployment Guide

Your secured-users feature requires database schema, private storage, and an Edge Function. Here's how to deploy:

## Step 1: Run Database Migration

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `dnfcnimefgokhezkzack`
3. Navigate to **SQL Editor** → Click **+ New Query**
4. Copy and paste the entire contents of `supabase/migrations/20261118230000_secured_users.sql`
5. Click **Run** and confirm the migration completed

**What it creates:**
- `secured_users` table with wallet address, mobile, ID file path, security asset, quantity, weight, price, and referrer details
- `secured_user_nonces` table for one-time wallet-signature challenges
- RLS policies (direct table access denied for browsers; only Edge Function can read/write)
- `secured-user-ids` private storage bucket (10 MB max per file; PDF, JPG, PNG only)

## Step 2: Set Edge Function Environment Secrets

1. Go to **Project Settings** → **Functions** → **Environment Variables**
2. Add these secrets:
   - **SUPABASE_URL**: `https://dnfcnimefgokhezkzack.supabase.co`
   - **SUPABASE_SERVICE_ROLE_KEY**: Your service role key (from Project Settings > API > Service Role Key)
   - **SECURED_USERS_ADMIN_WALLET**: `0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746`
   - **SECURED_USERS_ALLOWED_ORIGINS**: `http://localhost:5173,https://dexmitra.com` (comma-separated)

## Step 3: Deploy the Edge Function

### Option A: Using Supabase Dashboard (No CLI required)

1. Go to **Functions** → Click **Create a New Function**
2. Name it: `secured-users`
3. Replace the entire code with contents from `supabase/functions/secured-users/index.ts`
4. Click **Deploy**

### Option B: Using Supabase CLI (If you install it later)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Link your project
supabase link --project-ref dnfcnimefgokhezkzack

# Deploy the function
supabase functions deploy secured-users
```

## Step 4: Verify the Function Works

After deployment, test with curl:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"challenge","wallet":"0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746","purpose":"list"}' \
  https://dnfcnimefgokhezkzack.supabase.co/functions/v1/secured-users
```

You should get a JSON response with a `nonce` and `message` for wallet signing.

## Step 5: Configure Your Local Environment

Your `.env.local` has been created with:
```
VITE_SUPABASE_URL=https://dnfcnimefgokhezkzack.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_dkUDX-98DKQRiLr4WO5OGA_8rXVj0MR
```

## Step 6: Add Production URL to Allowed Origins

When you deploy to production, update the SECURED_USERS_ALLOWED_ORIGINS secret:

Go to **Project Settings** → **Functions** → **Environment Variables** → Edit `SECURED_USERS_ALLOWED_ORIGINS`:

```
http://localhost:5173,https://your-production-domain.com
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "ID document storage upload failed" | Ensure `secured-user-ids` bucket exists and is private (not public) |
| "Wallet authorization expired" | Wallet challenge nonce is 5 min; re-request from the form |
| "Origin is not allowed" | Add your domain to `SECURED_USERS_ALLOWED_ORIGINS` |
| "Not authorized to view records" | Only the admin wallet (`0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746`) can view records |
| "Service is not configured" | Ensure all 4 environment secrets are set |

## Security Notes

- **Service Role Key**: Never expose this in frontend code or public repositories. It's only used server-side in the Edge Function.
- **Admin Wallet**: The 2x plan form will show the records page only when the connected wallet matches this admin wallet.
- **Private Storage**: ID documents are stored in a private bucket. Only the Edge Function can upload; only signed URLs (60-second expiry) allow viewing.
- **Wallet Signatures**: All form submissions and admin reads require Ethereum message signatures verified server-side.

---

Need help? Check the README.md for the full architecture.
