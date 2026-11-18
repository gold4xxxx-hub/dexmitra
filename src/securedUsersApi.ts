import type { Address } from 'viem'

export type SecuredUserRecord = {
  id: string
  walletAddress: string
  mobileNumber: string
  idFileName: string
  idFileUrl: string
  securityAsset: 'Gold coin' | 'Silver coin'
  quantity: string
  weightGrams: string
  price: string
  referrerName: string
  referrerMobileNumber: string
  referrerAddress: string
  createdAt: string
}

export type SecuredUserSubmission = {
  walletAddress: Address
  mobileNumber: string
  idDocument: File
  securityAsset: 'Gold coin' | 'Silver coin'
  quantity: string
  weightGrams: string
  price: string
  referrerName: string
  referrerMobileNumber: string
  referrerAddress: Address
}

type Challenge = {
  nonce: string
  message: string
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Secured-user API returned an invalid response.')
  }
  return value as Record<string, unknown>
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const securedUsersApiConfigured = Boolean(supabaseUrl && publishableKey)

async function invoke(body: BodyInit, isJson: boolean): Promise<unknown> {
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Secured-user storage is not configured. Set the Supabase URL and publishable key.')
  }

  const headers = new Headers({
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
  })
  if (isJson) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${supabaseUrl}/functions/v1/secured-users`, {
    method: 'POST',
    headers,
    body,
  })
  const responseText = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(responseText) as unknown
  } catch {
    throw new Error(`Secured-user API returned an invalid response (${response.status}).`)
  }
  if (!response.ok) {
    const body = typeof payload === 'object' && payload !== null ? payload : {}
    const error = 'error' in body && typeof body.error === 'string' ? body.error : ''
    throw new Error(error || `Secured-user API failed (${response.status}).`)
  }
  return payload
}

export async function requestSecuredUserChallenge(wallet: Address, purpose: 'submit' | 'list'): Promise<Challenge> {
  const payload = objectValue(await invoke(JSON.stringify({ action: 'challenge', wallet, purpose }), true))
  if (typeof payload.nonce !== 'string' || typeof payload.message !== 'string') {
    throw new Error('Secured-user API returned an invalid wallet challenge.')
  }
  return { nonce: payload.nonce, message: payload.message }
}

export async function submitSecuredUserRecord(
  submission: SecuredUserSubmission,
  auth: { nonce: string; signature: `0x${string}` },
): Promise<{ id: string }> {
  const body = new FormData()
  body.set('action', 'submit')
  body.set('wallet', submission.walletAddress)
  body.set('nonce', auth.nonce)
  body.set('signature', auth.signature)
  body.set('mobile_number', submission.mobileNumber)
  body.set('id_document', submission.idDocument)
  body.set('security_asset', submission.securityAsset)
  body.set('quantity', submission.quantity)
  body.set('weight_grams', submission.weightGrams)
  body.set('price', submission.price)
  body.set('referrer_name', submission.referrerName)
  body.set('referrer_mobile_number', submission.referrerMobileNumber)
  body.set('referrer_address', submission.referrerAddress)
  const payload = objectValue(await invoke(body, false))
  if (typeof payload.id !== 'string') throw new Error('Secured-user API did not return a record ID.')
  return { id: payload.id }
}

function parseSecuredUserRecord(value: unknown): SecuredUserRecord {
  const record = objectValue(value)
  const stringField = (field: string) => {
    const fieldValue = record[field]
    if (typeof fieldValue !== 'string') throw new Error('Secured-user API returned an invalid record.')
    return fieldValue
  }
  const securityAsset = record.securityAsset
  if (securityAsset !== 'Gold coin' && securityAsset !== 'Silver coin') {
    throw new Error('Secured-user API returned an invalid security asset.')
  }
  return {
    id: stringField('id'),
    walletAddress: stringField('walletAddress'),
    mobileNumber: stringField('mobileNumber'),
    idFileName: stringField('idFileName'),
    idFileUrl: stringField('idFileUrl'),
    securityAsset,
    quantity: stringField('quantity'),
    weightGrams: stringField('weightGrams'),
    price: stringField('price'),
    referrerName: stringField('referrerName'),
    referrerMobileNumber: stringField('referrerMobileNumber'),
    referrerAddress: stringField('referrerAddress'),
    createdAt: stringField('createdAt'),
  }
}

export async function listSecuredUserRecords(
  wallet: Address,
  auth: { nonce: string; signature: `0x${string}` },
): Promise<{ records: SecuredUserRecord[] }> {
  const payload = objectValue(await invoke(JSON.stringify({ action: 'list', wallet, ...auth }), true))
  if (!Array.isArray(payload.records)) throw new Error('Secured-user API returned an invalid records list.')
  return { records: payload.records.map(parseSecuredUserRecord) }
}
