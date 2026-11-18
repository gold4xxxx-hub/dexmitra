import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export type CoinType = 'Gold coin' | 'Silver coin'
export type TransactionType = 'buy' | 'sell'

export interface CoinPrice {
  id: string
  coin_type: CoinType
  price_per_gram: string
  updated_at: string
}

export interface UserCoinBalance {
  id: string
  wallet_address: string
  gold_quantity: number
  gold_weight_grams: string
  silver_quantity: number
  silver_weight_grams: string
  updated_at: string
}

export interface CoinTransaction {
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

// Get current coin prices
export async function getCoinPrices(): Promise<CoinPrice[]> {
  const { data, error } = await supabase
    .from('coin_prices')
    .select('*')
    .order('coin_type', { ascending: true })

  if (error) throw new Error(`Failed to fetch coin prices: ${error.message}`)
  return data || []
}

// Get user's coin balance
export async function getUserCoinBalance(walletAddress: string): Promise<UserCoinBalance | null> {
  const { data, error } = await supabase
    .from('user_coin_balances')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch coin balance: ${error.message}`)
  return data
}

// Get user's transaction history
export async function getCoinTransactionHistory(
  walletAddress: string,
  limit = 50
): Promise<CoinTransaction[]> {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch transaction history: ${error.message}`)
  return data || []
}

// Buy coins (admin operation via Edge Function)
export async function buyCoin(params: {
  walletAddress: string
  coinType: CoinType
  quantity: number
  weightGrams: string
  pricePerGram: string
  totalPrice: string
  notes?: string
}): Promise<CoinTransaction> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/coin-trading`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'buy',
        wallet_address: params.walletAddress.toLowerCase(),
        coin_type: params.coinType,
        quantity: params.quantity,
        weight_grams: params.weightGrams,
        price_per_gram: params.pricePerGram,
        total_price: params.totalPrice,
        notes: params.notes,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to process buy transaction')
  }

  const result = await response.json() as { transaction: CoinTransaction }
  return result.transaction
}

// Sell coins (admin operation via Edge Function)
export async function sellCoin(params: {
  walletAddress: string
  coinType: CoinType
  quantity: number
  weightGrams: string
  pricePerGram: string
  totalPrice: string
  notes?: string
}): Promise<CoinTransaction> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/coin-trading`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sell',
        wallet_address: params.walletAddress.toLowerCase(),
        coin_type: params.coinType,
        quantity: params.quantity,
        weight_grams: params.weightGrams,
        price_per_gram: params.pricePerGram,
        total_price: params.totalPrice,
        notes: params.notes,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to process sell transaction')
  }

  const result = await response.json() as { transaction: CoinTransaction }
  return result.transaction
}

// Get all transactions (admin only via Edge Function)
export async function getAllCoinTransactions(adminWallet: string, nonce: string, signature: string) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/coin-trading`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list_all',
        admin_wallet: adminWallet.toLowerCase(),
        nonce,
        signature,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch transactions')
  }

  return response.json()
}

// Update coin prices (admin only via Edge Function)
export async function updateCoinPrice(
  adminWallet: string,
  nonce: string,
  signature: string,
  coinType: CoinType,
  pricePerGram: string
) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/coin-trading`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_price',
        admin_wallet: adminWallet.toLowerCase(),
        nonce,
        signature,
        coin_type: coinType,
        price_per_gram: pricePerGram,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update coin price')
  }

  return response.json()
}
