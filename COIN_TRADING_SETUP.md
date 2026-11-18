# Coin Trading Setup Guide

The 2x-plan secured-users feature now includes **coin trading** (buy/sell gold and silver coins) with inventory tracking and transaction history.

## Features

✅ **Buy Coins** — Add coins to user inventory  
✅ **Sell Coins** — Reduce coins from inventory  
✅ **Admin Pricing** — Set price per gram for each coin type  
✅ **User Balances** — Track quantity and total weight per user  
✅ **Transaction History** — Full audit log of all trades  
✅ **Wallet Signature Auth** — Secure admin operations  

## Database Schema

Three new Supabase tables are created:

| Table | Purpose |
|-------|---------|
| `coin_prices` | Current gold/silver coin prices (₹/gram) |
| `user_coin_balances` | Per-user inventory (quantity + weight) |
| `coin_transactions` | Buy/sell audit log with timestamps |

---

## Deployment Steps

### Step 1: Run the Coin Trading Migration

1. Go to **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Copy and paste the entire contents from: `supabase/migrations/20261119000000_coin_trading.sql`
3. Click **Run**
4. ✅ Tables created successfully

**Default Prices (auto-initialized):**
- Gold coin: ₹65.00/gram
- Silver coin: ₹0.80/gram

### Step 2: Deploy the Coin Trading Edge Function

1. Go to **Functions** → **Create a new function**
2. Name: `coin-trading`
3. Copy contents from: `supabase/functions/coin-trading/index.ts`
4. Paste into the editor
5. Click **Deploy**

**The function requires these environment secrets** (already set from secured-users):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SECURED_USERS_ADMIN_WALLET`
- `SECURED_USERS_ALLOWED_ORIGINS`

### Step 3: Import the Component in App.tsx

Add the coin trading panel to your secured-users page:

```tsx
import { CoinTradingPanel } from './CoinTrading'

// In your secured-users page JSX:
{isContractOwner && adminPage === 'secured-users' && (
  <CoinTradingPanel
    walletAddress={account}
    isAdmin={isContractOwner}
    onError={(error) => setSecuredUserError(error)}
    onSuccess={(message) => setSecuredUserSuccess(message)}
  />
)}
```

### Step 4: Test Locally

1. Run: `npm run dev`
2. Open: `http://localhost:5173`
3. Connect your wallet
4. Navigate to **Secured Users** page
5. Click the **Buy** tab
6. Fill in:
   - Coin Type: Gold coin
   - Quantity: 1
   - Weight: 10.5 (grams)
   - Price per gram: 65
   - Total Price: 682.5 (auto-calculated)
7. Click **Buy Coins**
8. ✅ Transaction recorded in history

---

## API Endpoints

### Buy Coins

```bash
POST /functions/v1/coin-trading
Content-Type: application/json

{
  "action": "buy",
  "wallet_address": "0x...",
  "coin_type": "Gold coin",
  "quantity": 1,
  "weight_grams": "10.5",
  "price_per_gram": "65.0",
  "total_price": "682.5",
  "notes": "Optional notes"
}
```

**Response:**
```json
{
  "transaction": {
    "id": "uuid",
    "wallet_address": "0x...",
    "transaction_type": "buy",
    "coin_type": "Gold coin",
    "quantity": 1,
    "weight_grams": "10.5",
    "price_per_gram": "65.0",
    "total_price": "682.5",
    "status": "completed",
    "created_at": "2026-11-19T10:30:00Z"
  }
}
```

### Sell Coins

```bash
POST /functions/v1/coin-trading
Content-Type: application/json

{
  "action": "sell",
  "wallet_address": "0x...",
  "coin_type": "Gold coin",
  "quantity": 1,
  "weight_grams": "10.5",
  "notes": "Optional notes"
}
```

The function automatically:
1. Looks up the current gold/silver price
2. Calculates total price: weight × price_per_gram
3. Checks user has sufficient inventory
4. Updates balance (reduces quantity/weight)
5. Records transaction

### Admin: List All Transactions

```bash
POST /functions/v1/coin-trading
Content-Type: application/json

{
  "action": "list_all",
  "admin_wallet": "0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746",
  "nonce": "uuid-from-challenge",
  "signature": "0x..."
}
```

Returns all 500 most recent transactions (requires wallet signature).

### Admin: Update Coin Price

```bash
POST /functions/v1/coin-trading
Content-Type: application/json

{
  "action": "update_price",
  "admin_wallet": "0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746",
  "nonce": "uuid-from-challenge",
  "signature": "0x...",
  "coin_type": "Gold coin",
  "price_per_gram": "68.5"
}
```

---

## TypeScript Types

```typescript
type CoinType = 'Gold coin' | 'Silver coin'
type TransactionType = 'buy' | 'sell'

interface CoinPrice {
  id: string
  coin_type: CoinType
  price_per_gram: string
  updated_at: string
}

interface UserCoinBalance {
  id: string
  wallet_address: string
  gold_quantity: number
  gold_weight_grams: string
  silver_quantity: number
  silver_weight_grams: string
  updated_at: string
}

interface CoinTransaction {
  id: string
  wallet_address: string
  transaction_type: TransactionType
  coin_type: CoinType
  quantity: number
  weight_grams: string
  price_per_gram: string
  total_price: string
  status: 'pending' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
}
```

---

## Usage in React

```typescript
import {
  getCoinPrices,
  getUserCoinBalance,
  getCoinTransactionHistory,
  buyCoin,
  sellCoin,
  updateCoinPrice,
} from './coinTradingApi'

// Get current prices
const prices = await getCoinPrices()
console.log(prices[0].price_per_gram) // "65.00"

// Get user's inventory
const balance = await getUserCoinBalance('0x...')
console.log(balance.gold_quantity) // 5
console.log(balance.gold_weight_grams) // "52.500"

// Get user's transaction history
const history = await getCoinTransactionHistory('0x...')
history.forEach(tx => console.log(tx.transaction_type, tx.total_price))

// Buy coins
const buyTx = await buyCoin({
  walletAddress: '0x...',
  coinType: 'Gold coin',
  quantity: 1,
  weightGrams: '10.5',
  pricePerGram: '65.00',
  totalPrice: '682.50',
  notes: 'Purchase for holdings',
})

// Sell coins
const sellTx = await sellCoin({
  walletAddress: '0x...',
  coinType: 'Gold coin',
  quantity: 1,
  weightGrams: '10.5',
})
```

---

## Admin Operations

Admin (wallet: `0xA0fedfbfe186C90aB5a4CBb5Db1c704d72369746`) can:

1. **View all transactions** — via wallet signature challenge
2. **Update coin prices** — Change gold/silver prices per gram
3. **Monitor inventory** — Track total coins held by all users

Admin operations require:
- Ethereum message signature (from wallet challenge)
- 5-minute nonce expiry
- One-time nonce consumption

---

## Validation Rules

| Field | Rule |
|-------|------|
| `quantity` | Positive integer |
| `weight_grams` | Decimal ≤ 18 digits, ≤ 3 decimal places |
| `price_per_gram` | Decimal ≤ 20 digits, ≤ 6 decimal places |
| `total_price` | Decimal ≤ 20 digits, ≤ 6 decimal places |
| `coin_type` | Must be 'Gold coin' or 'Silver coin' |
| `wallet_address` | Valid Ethereum address (checksummed) |

---

## RLS Policies

| Table | Public | Wallet Owner | Service Role |
|-------|--------|--------------|--------------|
| `coin_prices` | READ ✓ | READ ✓ | ALL ✓ |
| `user_coin_balances` | NONE | READ own ✓ | ALL ✓ |
| `coin_transactions` | NONE | READ own ✓ | ALL ✓ |

**RLS Details:**
- Users can only view their own balances and transactions
- Coin prices are publicly readable
- Only the Edge Function (service role) can insert/update records

---

## Error Handling

```typescript
try {
  const tx = await buyCoin({ ... })
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    // "User not found in secured users"
    // "Invalid quantity"
    // "Failed to update user balance"
    // "Insufficient coin quantity"
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "User not found in secured users" | User must complete secured-user form first |
| "Insufficient coin quantity" | User balance too low for sell amount |
| "Invalid price_per_gram" | Must be decimal, e.g., "65.00" not "65" |
| "Wallet authorization expired" | Nonce is 5 min; re-request fresh challenge |
| "Origin not allowed" | Add your domain to `SECURED_USERS_ALLOWED_ORIGINS` |
| "Service not configured" | Ensure all 4 function environment secrets are set |

---

## Next Steps

1. ✅ Deploy migration and Edge Function
2. ✅ Import `CoinTradingPanel` in `App.tsx`
3. ✅ Test buy/sell locally
4. ✅ Monitor transaction history
5. Update coin prices as market changes:
   ```tsx
   await updateCoinPrice(adminWallet, nonce, signature, 'Gold coin', '68.50')
   ```

For production, consider:
- **Notifications** — Email/SMS on major trades
- **Reports** — Export transaction CSV for accounting
- **Limits** — Max buy/sell per transaction
- **Fees** — Add commission on trades
- **History cleanup** — Archive old transactions

---

**Estimated setup time: 10 minutes**  
**Files to deploy: 4** (migration + function + 2 React files)
