import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { getAddress, isAddress, verifyMessage, type Hex } from 'npm:viem@2.57.16'

const bucketName = 'secured-user-ids'
const maxFileSize = 10 * 1024 * 1024
const allowedOrigins = (Deno.env.get('SECURED_USERS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

type Purpose = 'submit' | 'list'

type ApiPayload = {
  action?: string
  wallet?: string
  nonce?: string
  signature?: string
  purpose?: string
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const adminWallet = Deno.env.get('SECURED_USERS_ADMIN_WALLET')?.toLowerCase()

function responseHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  }
}

function jsonResponse(body: object, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) })
}

function stringValue(value: FormDataEntryValue | string | undefined | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function validDecimal(value: string, precision: number, scale: number) {
  if (!/^(?:\d+|\d*\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0) return false
  const [whole, fraction = ''] = value.split('.')
  const wholeDigits = (whole || '0').replace(/^0+/, '') || '0'
  return wholeDigits.length <= precision - scale && fraction.length <= scale
}

function validPhone(value: string) {
  return /^\+?[0-9\s().-]{5,40}$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 5
}

function detectFileType(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-') return 'application/pdf'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  return null
}

function fileExtension(mimeType: string) {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/png') return 'png'
  return 'jpg'
}

function normalizeWallet(value: string) {
  if (!isAddress(value, { strict: false })) return null
  return getAddress(value).toLowerCase()
}

async function authenticate(
  supabase: SupabaseClient,
  wallet: string,
  nonce: string,
  signature: string,
  purpose: Purpose,
) {
  const { data: challenge, error: challengeError } = await supabase
    .from('secured_user_nonces')
    .select('message')
    .eq('wallet_address', wallet)
    .eq('nonce', nonce)
    .eq('purpose', purpose)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (challengeError) throw new Error('Could not verify the wallet challenge.')
  if (!challenge) return false
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false

  let validSignature: boolean
  try {
    validSignature = await verifyMessage({
      address: getAddress(wallet),
      message: challenge.message,
      signature: signature as Hex,
    })
  } catch {
    return false
  }
  if (!validSignature) return false

  const { data: consumed, error: consumeError } = await supabase.rpc('consume_secured_user_nonce', {
    p_wallet_address: wallet,
    p_nonce: nonce,
    p_purpose: purpose,
  })
  if (consumeError) throw new Error('Could not consume the wallet challenge.')
  return consumed === true
}

async function createChallenge(
  supabase: SupabaseClient,
  wallet: string,
  purpose: Purpose,
  origin: string,
) {
  if (purpose === 'list' && wallet !== adminWallet) return null

  const { error: cleanupError } = await supabase
    .from('secured_user_nonces')
    .delete()
    .lt('expires_at', new Date().toISOString())
  if (cleanupError) throw new Error('Could not clean up expired wallet challenges.')
  const nonce = crypto.randomUUID()
  const issuedAt = new Date().toISOString()
  const message = [
    'Dexmitra secured-user authorization',
    `Origin: ${origin}`,
    `Action: ${purpose}`,
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { error } = await supabase.from('secured_user_nonces').insert({
    wallet_address: wallet,
    nonce,
    purpose,
    message,
    expires_at: expiresAt,
  })
  if (error) throw new Error('Could not create a wallet challenge.')
  return { nonce, message }
}

async function handleSubmission(supabase: SupabaseClient, form: FormData) {
  const wallet = normalizeWallet(stringValue(form.get('wallet')))
  const nonce = stringValue(form.get('nonce'))
  const signature = stringValue(form.get('signature'))
  const mobileNumber = stringValue(form.get('mobile_number'))
  const securityAsset = stringValue(form.get('security_asset'))
  const quantity = stringValue(form.get('quantity'))
  const weightGrams = stringValue(form.get('weight_grams'))
  const price = stringValue(form.get('price'))
  const referrerName = stringValue(form.get('referrer_name'))
  const referrerMobileNumber = stringValue(form.get('referrer_mobile_number'))
  const referrerAddress = normalizeWallet(stringValue(form.get('referrer_address')))
  const idDocument = form.get('id_document')

  if (!wallet || !nonce || !signature) return { error: 'Invalid wallet authorization.', status: 400 }
  if (!validPhone(mobileNumber)) return { error: 'Enter a valid mobile number.', status: 400 }
  if (securityAsset !== 'Gold coin' && securityAsset !== 'Silver coin') return { error: 'Select a supported security asset.', status: 400 }
  if (!/^[1-9]\d*$/.test(quantity) || !Number.isSafeInteger(Number(quantity))) return { error: 'Quantity must be a positive whole number.', status: 400 }
  if (!validDecimal(weightGrams, 18, 3) || !validDecimal(price, 20, 6)) return { error: 'Enter a valid positive weight and price.', status: 400 }
  if (!referrerName || referrerName.length > 160 || !validPhone(referrerMobileNumber) || !referrerAddress) {
    return { error: 'Enter valid referrer details.', status: 400 }
  }
  if (!(idDocument instanceof File) || idDocument.size === 0 || idDocument.size > maxFileSize) {
    return { error: 'Select an ID file no larger than 10 MB.', status: 400 }
  }

  const fileBytes = new Uint8Array(await idDocument.arrayBuffer())
  const mimeType = detectFileType(fileBytes)
  if (!mimeType) return { error: 'ID document must be a valid PDF, JPG, or PNG.', status: 400 }
  if (!await authenticate(supabase, wallet, nonce, signature, 'submit')) {
    return { error: 'Wallet authorization expired or is invalid. Please try again.', status: 401 }
  }

  const { data: previousRecord, error: previousRecordError } = await supabase
    .from('secured_users')
    .select('id_file_path')
    .eq('wallet_address', wallet)
    .maybeSingle()
  if (previousRecordError) return { error: 'Could not load the existing secured-user record.', status: 502 }

  const filePath = `${wallet}/${crypto.randomUUID()}.${fileExtension(mimeType)}`
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, fileBytes, { contentType: mimeType, upsert: false })
  if (uploadError) return { error: 'Could not securely upload the ID document.', status: 502 }

  const { data: record, error: insertError } = await supabase
    .from('secured_users')
    .upsert({
      wallet_address: wallet,
      mobile_number: mobileNumber,
      id_file_path: filePath,
      security_asset: securityAsset,
      quantity: Number(quantity),
      weight_grams: weightGrams,
      price,
      referrer_name: referrerName,
      referrer_mobile_number: referrerMobileNumber,
      referrer_address: referrerAddress,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })
    .select('id')
    .single()

  if (insertError || !record) {
    await supabase.storage.from(bucketName).remove([filePath])
    return { error: 'Could not save secured-user details.', status: 502 }
  }

  if (previousRecord?.id_file_path && previousRecord.id_file_path !== filePath) {
    const { error: removeError } = await supabase.storage.from(bucketName).remove([previousRecord.id_file_path])
    if (removeError) console.error('Could not remove a replaced private ID document.')
  }
  return { id: record.id, status: 200 }
}

async function listRecords(supabase: SupabaseClient, wallet: string, nonce: string, signature: string) {
  if (wallet !== adminWallet) return { error: 'Not authorized to view secured-user records.', status: 403 }
  if (!await authenticate(supabase, wallet, nonce, signature, 'list')) {
    return { error: 'Wallet authorization expired or is invalid. Please try again.', status: 401 }
  }

  const { data, error } = await supabase
    .from('secured_users')
    .select('id, wallet_address, mobile_number, id_file_path, security_asset, quantity, weight_grams, price, referrer_name, referrer_mobile_number, referrer_address, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { error: 'Could not load secured-user records.', status: 502 }

  const records = await Promise.all((data ?? []).map(async (record) => {
    const { data: signedFile, error: signedFileError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(record.id_file_path, 60)
    if (signedFileError || !signedFile) throw new Error('Could not create a private ID-document link.')
    return {
      id: record.id,
      walletAddress: record.wallet_address,
      mobileNumber: record.mobile_number,
      idFileName: 'ID document',
      idFileUrl: signedFile.signedUrl,
      securityAsset: record.security_asset,
      quantity: String(record.quantity),
      weightGrams: String(record.weight_grams),
      price: String(record.price),
      referrerName: record.referrer_name,
      referrerMobileNumber: record.referrer_mobile_number,
      referrerAddress: record.referrer_address,
      createdAt: record.created_at,
    }
  }))
  return { records, status: 200 }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (allowedOrigins.length === 0) {
    return jsonResponse({ error: 'Secured-user allowed origins are not configured.' }, 503, null)
  }
  if (origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, null)
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(origin) })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin)
  if (!supabaseUrl || !serviceRoleKey || !adminWallet || !isAddress(adminWallet, { strict: false })) {
    return jsonResponse({ error: 'Secured-user service is not configured.' }, 503, origin)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      if (stringValue(form.get('action')) !== 'submit') return jsonResponse({ error: 'Unsupported action.' }, 400, origin)
      const result = await handleSubmission(supabase, form)
      const body = 'error' in result ? { error: result.error } : { id: result.id }
      return jsonResponse(body, result.status, origin)
    }

    const payload = await request.json() as ApiPayload
    const wallet = normalizeWallet(payload.wallet ?? '')
    if (!wallet) return jsonResponse({ error: 'Enter a valid wallet address.' }, 400, origin)

    if (payload.action === 'challenge') {
      if (payload.purpose !== 'submit' && payload.purpose !== 'list') return jsonResponse({ error: 'Unsupported challenge purpose.' }, 400, origin)
      const challenge = await createChallenge(supabase, wallet, payload.purpose, origin ?? 'unknown')
      if (!challenge) return jsonResponse({ error: 'Not authorized to view secured-user records.' }, 403, origin)
      return jsonResponse(challenge, 200, origin)
    }

    if (payload.action === 'list') {
      const result = await listRecords(supabase, wallet, payload.nonce ?? '', payload.signature ?? '')
      const body = 'error' in result ? { error: result.error } : { records: result.records }
      return jsonResponse(body, result.status, origin)
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400, origin)
  } catch (error) {
    console.error('Secured-user request failed:', error instanceof Error ? error.message : 'Unexpected error')
    return jsonResponse({ error: 'The secured-user request could not be completed.' }, 500, origin)
  }
})
