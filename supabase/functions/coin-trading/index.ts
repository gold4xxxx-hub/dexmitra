import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { getAddress, isAddress, verifyMessage, type Hex } from 'npm:viem@2.57.16'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const adminWallet = Deno.env.get('SECURED_USERS_ADMIN_WALLET')?.toLowerCase()
const allowedOrigins = (Deno.env.get('SECURED_USERS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

type CoinType = 'Gold coin' | 'Silver coin'

interface ApiPayload {
  action?: string
  wallet_address?: string
  admin_wallet?: string
  nonce?: string
  signature?: string
  coin_type?: string
  quantity?: number
  weight_grams?: string
  price_per_gram?: string
  total_price?: string
  notes?: string
}

function responseHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  }
}

function jsonResponse(body: object, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) })
}

function normalizeWallet(value: string) {
  if (!isAddress(value, { strict: false })) return null
  return getAddress(value).toLowerCase()
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validDecimal(value: string, precision: number, scale: number) {
  if (!/^(?:\d+|\d*\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0) return false
  const [whole, fraction = ''] = value.split('.')
  const wholeDigits = (whole || '0').replace(/^0+/, '') || '0'
  return wholeDigits.length <= precision - scale && fraction.length <= scale
}

async function authenticate(
  supabase: SupabaseClient,
  wallet: string,
  nonce: string,
  signature: string,
  purpose: 'buy' | 'sell' | 'list_all' | 'update_price'
) {
  if (purpose !== 'buy' && purpose !== 'sell') {
    if (wallet !== adminWallet) return false
  }

  const { data: challenge, error: challengeError } = await supabase
    .from('secured_user_nonces')
    .select('message')
    .eq('wallet_address', wallet)
    .eq('nonce', nonce)
    .eq('purpose', purpose === 'buy' || purpose === 'sell' ? 'submit' : 'list')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (challengeError || !challenge) return false
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false

  try {
    const validSignature = await verifyMessage({
      address: getAddress(wallet),
      message: challenge.message,
      signature: signature as Hex,
    })
    if (!validSignature) return false
  } catch {
    return false
  }

  const { data: consumed, error: consumeError } = await supabase.rpc('consume_secured_user_nonce', {
    p_wallet_address: wallet,
    p_nonce: nonce,
    p_purpose: purpose === 'buy' || purpose === 'sell' ? 'submit' : 'list',
  })

  return !consumeError && consumed === true
}

async function handleBuyCoin(supabase: SupabaseClient, payload: ApiPayload) {
  const wallet = normalizeWallet(payload.wallet_address ?? '')
  const coinType = stringValue(payload.coin_type) as CoinType
  const quantity = payload.quantity
  const weightGrams = stringValue(payload.weight_grams)
  const pricePerGram = stringValue(payload.price_per_gram)
  const totalPrice = stringValue(payload.total_price)
  const notes = stringValue(payload.notes)

  if (!wallet) return { error: 'Invalid wallet address', status: 400 }
  if (coinType !== 'Gold coin' && coinType !== 'Silver coin') return { error: 'Invalid coin type', status: 400 }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return { error: 'Invalid quantity', status: 400 }
  if (!validDecimal(weightGrams, 18, 3)) return { error: 'Invalid weight', status: 400 }
  if (!validDecimal(pricePerGram, 20, 6)) return { error: 'Invalid price per gram', status: 400 }
  if (!validDecimal(totalPrice, 20, 6)) return { error: 'Invalid total price', status: 400 }

  const { data: securedUser, error: securedUserError } = await supabase
    .from('secured_users')
    .select('id')
    .eq('wallet_address', wallet)
    .maybeSingle()

  if (securedUserError || !securedUser) return { error: 'User not found in secured users', status: 404 }

  const { data: balance } = await supabase
    .from('user_coin_balances')
    .select('*')
    .eq('wallet_address', wallet)
    .maybeSingle()

  let newBalance = balance
  if (!balance) {
    const { data: created } = await supabase
      .from('user_coin_balances')
      .insert({ wallet_address: wallet })
      .select()
      .single()
    newBalance = created
  }

  if (!newBalance) return { error: 'Failed to initialize user balance', status: 502 }

  const updateData: Record<string, unknown> = {}
  if (coinType === 'Gold coin') {
    updateData.gold_quantity = (newBalance.gold_quantity || 0) + quantity
    const currentWeight = Number(newBalance.gold_weight_grams || 0)
    updateData.gold_weight_grams = (currentWeight + Number(weightGrams)).toFixed(3)
  } else {
    updateData.silver_quantity = (newBalance.silver_quantity || 0) + quantity
    const currentWeight = Number(newBalance.silver_weight_grams || 0)
    updateData.silver_weight_grams = (currentWeight + Number(weightGrams)).toFixed(3)
  }
  updateData.updated_at = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('user_coin_balances')
    .update(updateData)
    .eq('wallet_address', wallet)

  if (updateError) return { error: 'Failed to update user balance', status: 502 }

  const { data: transaction, error: transactionError } = await supabase
    .from('coin_transactions')
    .insert({
      wallet_address: wallet,
      transaction_type: 'buy',
      coin_type: coinType,
      quantity,
      weight_grams: weightGrams,
      price_per_gram: pricePerGram,
      total_price: totalPrice,
      status: 'completed',
      notes: notes || null,
    })
    .select()
    .single()

  if (transactionError || !transaction) return { error: 'Failed to record transaction', status: 502 }

  return { transaction, status: 200 }
}

async function handleSellCoin(supabase: SupabaseClient, payload: ApiPayload) {
  const wallet = normalizeWallet(payload.wallet_address ?? '')
  const coinType = stringValue(payload.coin_type) as CoinType
  const quantity = payload.quantity
  const weightGrams = stringValue(payload.weight_grams)
  const pricePerGram = stringValue(payload.price_per_gram)
  const totalPrice = stringValue(payload.total_price)
  const notes = stringValue(payload.notes)

  if (!wallet) return { error: 'Invalid wallet address', status: 400 }
  if (coinType !== 'Gold coin' && coinType !== 'Silver coin') return { error: 'Invalid coin type', status: 400 }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return { error: 'Invalid quantity', status: 400 }
  if (!validDecimal(weightGrams, 18, 3)) return { error: 'Invalid weight', status: 400 }
  if (!validDecimal(pricePerGram, 20, 6)) return { error: 'Invalid price per gram', status: 400 }
  if (!validDecimal(totalPrice, 20, 6)) return { error: 'Invalid total price', status: 400 }

  const { data: balance, error: balanceError } = await supabase
    .from('user_coin_balances')
    .select('*')
    .eq('wallet_address', wallet)
    .maybeSingle()

  if (balanceError || !balance) return { error: 'User balance not found', status: 404 }

  const currentQuantity = coinType === 'Gold coin' ? balance.gold_quantity : balance.silver_quantity
  if (currentQuantity < quantity) return { error: 'Insufficient coin quantity', status: 400 }

  const updateData: Record<string, unknown> = {}
  if (coinType === 'Gold coin') {
    updateData.gold_quantity = currentQuantity - quantity
    const currentWeight = Number(balance.gold_weight_grams || 0)
    updateData.gold_weight_grams = Math.max(0, currentWeight - Number(weightGrams)).toFixed(3)
  } else {
    updateData.silver_quantity = currentQuantity - quantity
    const currentWeight = Number(balance.silver_weight_grams || 0)
    updateData.silver_weight_grams = Math.max(0, currentWeight - Number(weightGrams)).toFixed(3)
  }
  updateData.updated_at = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('user_coin_balances')
    .update(updateData)
    .eq('wallet_address', wallet)

  if (updateError) return { error: 'Failed to update user balance', status: 502 }

  const { data: transaction, error: transactionError } = await supabase
    .from('coin_transactions')
    .insert({
      wallet_address: wallet,
      transaction_type: 'sell',
      coin_type: coinType,
      quantity,
      weight_grams: weightGrams,
      price_per_gram: pricePerGram,
      total_price: totalPrice,
      status: 'completed',
      notes: notes || null,
    })
    .select()
    .single()

  if (transactionError || !transaction) return { error: 'Failed to record transaction', status: 502 }

  return { transaction, status: 200 }
}

async function listAllTransactions(supabase: SupabaseClient, payload: ApiPayload) {
  const wallet = normalizeWallet(payload.admin_wallet ?? '')
  if (wallet !== adminWallet) return { error: 'Not authorized', status: 403 }

  const nonce = stringValue(payload.nonce)
  const signature = stringValue(payload.signature)

  if (!await authenticate(supabase, wallet, nonce, signature, 'list_all')) {
    return { error: 'Invalid authorization', status: 401 }
  }

  const { data: transactions, error } = await supabase
    .from('coin_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return { error: 'Failed to fetch transactions', status: 502 }

  return { transactions, status: 200 }
}

async function updateCoinPrice(supabase: SupabaseClient, payload: ApiPayload) {
  const wallet = normalizeWallet(payload.admin_wallet ?? '')
  if (wallet !== adminWallet) return { error: 'Not authorized', status: 403 }

  const nonce = stringValue(payload.nonce)
  const signature = stringValue(payload.signature)
  const coinType = stringValue(payload.coin_type) as CoinType
  const pricePerGram = stringValue(payload.price_per_gram)

  if (!await authenticate(supabase, wallet, nonce, signature, 'update_price')) {
    return { error: 'Invalid authorization', status: 401 }
  }

  if (coinType !== 'Gold coin' && coinType !== 'Silver coin') return { error: 'Invalid coin type', status: 400 }
  if (!validDecimal(pricePerGram, 20, 6)) return { error: 'Invalid price', status: 400 }

  const { data: price, error } = await supabase
    .from('coin_prices')
    .update({ price_per_gram: pricePerGram, updated_at: new Date().toISOString() })
    .eq('coin_type', coinType)
    .select()
    .single()

  if (error) return { error: 'Failed to update price', status: 502 }

  return { price, status: 200 }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: responseHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }

  if (!supabaseUrl || !serviceRoleKey || !adminWallet) {
    return jsonResponse({ error: 'Service not configured' }, 503, origin)
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const payload = (await request.json()) as ApiPayload

    if (payload.action === 'buy') {
      const result = await handleBuyCoin(supabase, payload)
      const body = 'error' in result ? { error: result.error } : { transaction: result.transaction }
      return jsonResponse(body, result.status, origin)
    }

    if (payload.action === 'sell') {
      const result = await handleSellCoin(supabase, payload)
      const body = 'error' in result ? { error: result.error } : { transaction: result.transaction }
      return jsonResponse(body, result.status, origin)
    }

    if (payload.action === 'list_all') {
      const result = await listAllTransactions(supabase, payload)
      const body = 'error' in result ? { error: result.error } : { transactions: result.transactions }
      return jsonResponse(body, result.status, origin)
    }

    if (payload.action === 'update_price') {
      const result = await updateCoinPrice(supabase, payload)
      const body = 'error' in result ? { error: result.error } : { price: result.price }
      return jsonResponse(body, result.status, origin)
    }

    return jsonResponse({ error: 'Unknown action' }, 400, origin)
  } catch (error) {
    console.error('Coin trading error:', error instanceof Error ? error.message : 'Unknown error')
    return jsonResponse({ error: 'Request failed' }, 500, origin)
  }
})
