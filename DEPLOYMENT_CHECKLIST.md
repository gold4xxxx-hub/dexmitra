# Supabase Deployment Checklist

Your Dexmitra 2x-plan secured-users feature is ready to deploy. Follow these steps:

## ✅ Configuration Ready
- [x] Frontend environment: `.env.local` created
- [x] Function environment: `supabase/functions/.env` prepared
- [x] Migration SQL: `supabase/DEPLOY_MIGRATION.sql` ready
- [x] Edge Function code: `supabase/functions/secured-users/index.ts` ready
- [x] App builds successfully with Supabase configuration

## 📋 Deployment Steps

### Step 1: Run Database Migration (5 minutes)
1. Go to: https://app.supabase.com
2. Select your project: **dnfcnimefgokhezkzack**
3. Click: **SQL Editor** (left sidebar)
4. Click: **New Query**
5. Open file: `supabase/DEPLOY_MIGRATION.sql`
6. Copy the entire SQL content
7. Paste into the SQL Editor
8. Click: **Run**
9. ✅ You should see: "Query executed successfully"

**What this creates:**
- `secured_users` table (wallet, mobile, ID file, security asset, quantity, weight, price, referrer)
- `secured_user_nonces` table (one-time wallet-signature challenges)
- RLS policies (blocks direct table access from browsers)
- `secured-user-ids` private storage bucket (10 MB max per file)

---

### Step 2: Set Function Environment Secrets (3 minutes)
1. Go to: **Project Settings** (bottom left)
2. Click: **Functions** (in left sidebar under Settings)
3. Scroll to: **Environment Variables**
4. Click: **Add Secret** (or **Edit** if variables already exist)
5. Add these 4 variables one by one:

| Variable Name | Value |
|---|---|
| `SUPABASE_URL` | `https://dnfcnimefgokhezkzack.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `dnfcnimefgokhezkzack` |
| `SECURED_USERS_ADMIN_WALLET` | `0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746` |
| `SECURED_USERS_ALLOWED_ORIGINS` | `http://localhost:5173` |

6. Click: **Save** after each variable
7. ✅ All 4 variables should be listed

---

### Step 3: Create & Deploy Edge Function (5 minutes)
1. Go to: **Functions** (in left sidebar)
2. Click: **Create a New Function**
3. Enter name: `secured-users`
4. Click: **Create Function**
5. You'll see a default TypeScript template
6. Open file: `supabase/functions/secured-users/index.ts`
7. Copy the entire code
8. In the Supabase editor, **select all** and **delete** the template
9. Paste the contents of `index.ts`
10. Click: **Deploy** (top right)
11. ✅ You should see: "Function deployed successfully"

---

### Step 4: Test the Function (2 minutes)
1. Go to: **Functions** → **secured-users**
2. Click: **Invite** or **Share** to see the function URL
3. Function URL will be: `https://dnfcnimefgokhezkzack.supabase.co/functions/v1/secured-users`
4. Open a terminal and run:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"action":"challenge","wallet":"0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746","purpose":"list"}' \
     https://dnfcnimefgokhezkzack.supabase.co/functions/v1/secured-users
   ```
5. ✅ You should get a response with `nonce` and `message`

---

### Step 5: Test Locally (5 minutes)
1. Open terminal in this directory
2. Run: `npm.cmd run dev`
3. Open: `http://localhost:5173`
4. Connect your wallet
5. Try the **2x Plan** registration:
   - You should see the "Secured Users" form
   - Fill in: mobile, security asset, quantity, weight, price, referrer details, ID document
   - Click: **Save Secured User Record**
   - ✅ You should see: "Record saved successfully"
   - Now you can proceed with 2x plan registration

---

### Step 6: Prepare for Production (Optional)
When you deploy to production:
1. Update `SECURED_USERS_ALLOWED_ORIGINS` to include your domain:
   ```
   http://localhost:5173,https://your-production-domain.com
   ```
2. Update the app's production environment variables with your domain

---

## 🔐 Security Notes

| Secret | Visibility | Used Where |
|--------|-----------|-----------|
| `VITE_SUPABASE_URL` | ✅ Public (in bundled JS) | Frontend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ Public (in bundled JS) | Frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 Secret (never in frontend) | Edge Function only |
| `SECURED_USERS_ADMIN_WALLET` | 🔒 Secret | Edge Function only |
| `SECURED_USERS_ALLOWED_ORIGINS` | 🔒 Secret | Edge Function only |

**Important:**
- The service role key and admin wallet are stored only in Supabase Function environment variables
- They are never exposed to the browser or public repository
- ID documents are stored in a private bucket; only signed 60-second URLs allow viewing
- All submissions and admin reads require Ethereum message signatures

---

## ❌ Troubleshooting

| Problem | Solution |
|---------|----------|
| "SQL syntax error" when running migration | Make sure you copied the entire `DEPLOY_MIGRATION.sql` file without truncation |
| "Function deployment failed" | Ensure all 4 environment secrets are set before deploying |
| "Origin is not allowed" | Make sure `SECURED_USERS_ALLOWED_ORIGINS` includes `http://localhost:5173` |
| "Wallet authorization expired" | The challenge nonce expires in 5 minutes; request a fresh one from the form |
| "Not authorized to view records" | Only wallet `0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746` can view admin records |
| "ID document upload failed" | Ensure the file is PDF, JPG, or PNG and under 10 MB |

---

## ✅ Deployment Complete When:

1. ✅ All SQL migration queries executed without errors
2. ✅ All 4 function environment secrets are visible in Project Settings
3. ✅ Function deployed successfully
4. ✅ curl test returns JSON with nonce and message
5. ✅ Local app shows "Secured Users" form for 2x plan
6. ✅ You can save a record and proceed with 2x registration

---

**Estimated time: ~20 minutes**

Need help? Check `README.md` and `DEPLOY_SUPABASE.md` for detailed documentation.
