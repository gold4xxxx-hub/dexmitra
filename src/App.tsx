import { useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeAlert,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Landmark,
  LoaderCircle,
  Menu,
  RefreshCw,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
} from 'viem'
import { bsc } from 'viem/chains'
import { contractAbi, erc20Abi, CONTRACT_ADDRESS, PAYMENT_TOKENS } from './contract'
import './dashboard.css'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

type UserSummary = {
  referrer: Address
  joinedAt: bigint
  plan: number
  registered: boolean
  blocked: boolean
  directCount: bigint
  totalInvested: bigint
  activeInvested: bigint
  totalEarned: bigint
  capEarned: bigint
  withdrawable: bigint
  lastWithdraw: bigint
  nextWithdrawAt: bigint
  directEarned: bigint
  levelEarned: bigint
  totalWithdrawn: bigint
  totalReinvested: bigint
  totalReinvestFees: bigint
  lastWithdrawAmount: bigint
  lastReinvestAmount: bigint
  lastReinvestAt: bigint
  incomeCap: bigint
  remainingToEarn: bigint
  activeInvestments: bigint
  pendingRoi: bigint
}

type Investment = {
  amount: bigint
  cap: bigint
  earned: bigint
  otherEarned: bigint
  startedAt: bigint
  lastAccrued: bigint
  active: boolean
  reinvest: boolean
}

type ContractTerms = {
  minInvest: bigint
  maxInvest: bigint
  registrationFee: bigint
  multiplierBps: readonly bigint[]
  roiBps: readonly bigint[]
  minDirects: readonly bigint[]
  paused: boolean
  plans: readonly number[]
  unit: bigint
}

type Action = 'register' | 'invest' | 'withdraw' | 'reinvest' | 'upgrade'
type View = 'dashboard' | 'positions' | 'plans' | 'analytics' | 'activity' | 'account' | 'referral'

type Toast = {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

type ConfirmModal = {
  action: Action
  amount: string
  token: string
  tokenSymbol: string
  fee?: string
  details: string
}

type TxRecord = {
  type: Action
  hash: `0x${string}`
  amount: string
  token: string
  timestamp: number
}

const ZERO_REFERRER = '0x0000000000000000000000000000000000000000' as Address

const publicClient = createPublicClient({ chain: bsc, transport: http() })

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function prettyAmount(value: bigint | undefined, decimals: number) {
  if (value === undefined) return '--'
  const [integer, fraction = ''] = formatUnits(value, decimals).split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, '')
  return trimmedFraction ? `${grouped}.${trimmedFraction}` : grouped
}

function formatCooldown(seconds: number) {
  if (seconds <= 0) return 'Ready'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0 || d > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message
    if (message.includes('User rejected')) return 'Transaction was rejected in your wallet.'
    return message.split('\n')[0].slice(0, 180)
  }
  return 'The request could not be completed.'
}

/* Animated counter: counts from 0 to target over ~1.2s with ease-out */
function formatJoinedAt(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatCounter(value: number, decimals: number) {
  const [integer, fraction = ''] = value.toFixed(Math.min(decimals, 4)).split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmedFraction = fraction.replace(/0+$/, '')
  return trimmedFraction ? `${grouped}.${trimmedFraction}` : grouped
}

type CounterProps = { target: bigint | null; decimals: number }
function Counter({ target, decimals }: CounterProps) {
  const [displayValue, setDisplayValue] = useState(0)
  useEffect(() => {
    const start = 0
    const end = target ? Number(target) / Number(10n ** BigInt(decimals)) : 0
    const startTime = performance.now()
    const duration = 1200
    let rafId: number
    const loop = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(start + (end - start) * ease)
      if (progress < 1) rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [target, decimals])
  return <span className="tabular-nums">{formatCounter(displayValue, decimals)}</span>
}

/* Empty state component with icon, title, description, and optional CTA */
function EmptyState({ icon, title, description, cta, onCta }: { icon: React.ReactNode; title: string; description: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <strong>{title}</strong>
      <span>{description}</span>
      {cta && onCta && (
        <button type="button" className="empty-state-cta" onClick={onCta}>
          {cta}
        </button>
      )}
    </div>
  )
}

/* Skeleton loader for metric values */
function Skeleton({ width = 80 }: { width?: number }) {
  return <span className="skeleton" style={{ width: `${width}px` }} />
}

function App() {
  const [account, setAccount] = useState<Address | null>(null)
  const [summary, setSummary] = useState<UserSummary | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [terms, setTerms] = useState<ContractTerms | null>(null)
  const [tokenAddress, setTokenAddress] = useState<string>(() => {
    const savedToken = localStorage.getItem('dexmitra-token')
    return PAYMENT_TOKENS.find((token) => token.address.toLowerCase() === savedToken?.toLowerCase())?.address ?? PAYMENT_TOKENS[0].address
  })
  const [tokenSymbol, setTokenSymbol] = useState<string>(PAYMENT_TOKENS[0].symbol)
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [tokenAllowed, setTokenAllowed] = useState<boolean | null>(null)
  const [contractUsdtBalance, setContractUsdtBalance] = useState<bigint | null>(null)
  const [contractGcBalance, setContractGcBalance] = useState<bigint | null>(null)
  const [walletUsdtBalance, setWalletUsdtBalance] = useState<bigint | null>(null)
  const [walletGcBalance, setWalletGcBalance] = useState<bigint | null>(null)
  const [levelBusiness, setLevelBusiness] = useState<bigint[]>([])
  const [levelEarned, setLevelEarned] = useState<bigint[]>([])
  const [levelPercentages, setLevelPercentages] = useState<bigint[]>([])
  const [action, setAction] = useState<Action>('register')
  const [view, setView] = useState<View>('dashboard')
  const [amount, setAmount] = useState('')
  const [referrer, setReferrer] = useState('')
  const [referrerMode, setReferrerMode] = useState<'manual' | 'root'>('manual')
  const [plan, setPlan] = useState('0')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [chartTab, setChartTab] = useState<'breakdown' | 'timeline'>('breakdown')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [withdrawCooldownRemaining, setWithdrawCooldownRemaining] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [timelineTab, setTimelineTab] = useState<'positions' | 'events'>('positions')
  const [pullToRefreshState, setPullToRefreshState] = useState<'idle' | 'pulling' | 'refreshing'>('idle')
  const [pullDistance, setPullDistance] = useState(0)
  const [loadRetry, setLoadRetry] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
  const [txHistory, setTxHistory] = useState<TxRecord[]>(() => {
    try {
      const saved = localStorage.getItem('dexmitra-tx-history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    localStorage.setItem('dexmitra-token', tokenAddress)
  }, [tokenAddress])

  useEffect(() => {
    localStorage.setItem('dexmitra-tx-history', JSON.stringify(txHistory))
  }, [txHistory])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const code = await publicClient.getBytecode({ address: CONTRACT_ADDRESS })
        if (!code) throw new Error('No contract bytecode was found at this address on BNB Smart Chain.')

        const [minInvest, maxInvest, registrationFee, config, paused, plan2x, plan3x, plan25x, unit] = await Promise.all([
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'minInvest' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'maxInvest' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'registrationFee' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getPlanConfig' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'paused' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'PLAN_2X' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'PLAN_3X' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'PLAN_25X' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'UNIT' }),
        ])
        if (!active) return
        setTerms({ minInvest, maxInvest, registrationFee, multiplierBps: config[0], roiBps: config[1], minDirects: config[2], paused, plans: [plan2x, plan3x, plan25x], unit })
        setPlan((current) => current === '0' ? String(plan2x) : current)

        if (account) {
          const [user, page] = await Promise.all([
            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getUserSummary', args: [account] }),
            publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getInvestmentsPaginated', args: [account, 0n, 50n] }),
          ])
          if (!active) return
          setSummary(user as unknown as UserSummary)
          setInvestments(page as unknown as Investment[])
        } else {
          setSummary(null)
          setInvestments([])
        }
      } catch (loadError) {
        if (active) setError(readableError(loadError))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [account, refreshVersion, loadRetry])

  useEffect(() => {
    let active = true
    const loadToken = async () => {
      if (!isAddress(tokenAddress)) {
        setTokenAllowed(null)
        return
      }
      try {
        const token = getAddress(tokenAddress)
        const [symbol, decimals, allowed] = await Promise.all([
          publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'tokenDecimals', args: [token] }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'allowedToken', args: [token] }),
        ])
        if (!active) return
        setTokenSymbol(symbol)
        setTokenDecimals(Number(decimals))
        setTokenAllowed(allowed)
      } catch {
        if (active) {
          setTokenSymbol('TOKEN')
          setTokenAllowed(false)
        }
      }
    }
    void loadToken()
    return () => { active = false }
  }, [tokenAddress, refreshVersion])

  useEffect(() => {
    const USDT_ADDR = '0x55d398326f99059ff775485246999027b3197955' as Address
    const GC_ADDR = '0x5C0D286F3812Da7f6bd766b7AAdadC7059938de8' as Address
    const balAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const
    let active = true
    const load = async () => {
      try {
        const [usdt, gc] = await Promise.all([
          publicClient.readContract({ address: USDT_ADDR, abi: balAbi, functionName: 'balanceOf', args: [CONTRACT_ADDRESS] }),
          publicClient.readContract({ address: GC_ADDR, abi: balAbi, functionName: 'balanceOf', args: [CONTRACT_ADDRESS] }),
        ])
        if (!active) return
        setContractUsdtBalance(usdt as unknown as bigint)
        setContractGcBalance(gc as unknown as bigint)
      } catch {
        if (active) {
          setContractUsdtBalance(null)
          setContractGcBalance(null)
        }
      }
    }
    void load()
    return () => { active = false }
  }, [refreshVersion])

  // Fetch wallet token balances when account changes
  useEffect(() => {
    if (!account) {
      const timer = setTimeout(() => {
        setWalletUsdtBalance(null)
        setWalletGcBalance(null)
      }, 0)
      return () => clearTimeout(timer)
    }
    let active = true
    const USDT_ADDR = '0x55d398326f99059ff775485246999027b3197955' as Address
    const GC_ADDR = '0x5C0D286F3812Da7f6bd766b7AAdadC7059938de8' as Address
    const balAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const
    const load = async () => {
      try {
        const [usdt, gc] = await Promise.all([
          publicClient.readContract({ address: USDT_ADDR, abi: balAbi, functionName: 'balanceOf', args: [account] }),
          publicClient.readContract({ address: GC_ADDR, abi: balAbi, functionName: 'balanceOf', args: [account] }),
        ])
        if (!active) return
        setWalletUsdtBalance(usdt as unknown as bigint)
        setWalletGcBalance(gc as unknown as bigint)
      } catch {
        if (active) {
          setWalletUsdtBalance(null)
          setWalletGcBalance(null)
        }
      }
    }
    void load()
    return () => { active = false }
  }, [account, refreshVersion])

  useEffect(() => {
    if (!account) {
      const timer = setTimeout(() => {
        setLevelBusiness([])
        setLevelEarned([])
        setLevelPercentages([])
      }, 0)
      return () => clearTimeout(timer)
    }
    let active = true
    const load = async () => {
      try {
        const [business, earned, pcts] = await Promise.all([
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getLevelBusiness', args: [account] }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getLevelEarned', args: [account] }),
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getLevelPercentages' }),
        ])
        if (!active) return
        setLevelBusiness(Array.from(business as unknown as bigint[]))
        setLevelEarned(Array.from(earned as unknown as bigint[]))
        setLevelPercentages(Array.from(pcts as unknown as bigint[]))
      } catch {
        if (active) {
          setLevelBusiness([])
          setLevelEarned([])
          setLevelPercentages([])
        }
      }
    }
    void load()
    return () => { active = false }
  }, [account, refreshVersion])

  useEffect(() => {
    const provider = window.ethereum
    if (!provider?.on) return
    const handleAccounts = (...accounts: unknown[]) => {
      const next = accounts[0] as string[] | undefined
      setAccount(next?.[0] && isAddress(next[0]) ? getAddress(next[0]) : null)
    }
    provider.on('accountsChanged', handleAccounts)
    return () => provider.removeListener?.('accountsChanged', handleAccounts)
  }, [])

  // Pull-to-refresh for mobile
  useEffect(() => {
    const startYRef = { current: 0 }
    const isPullingRef = { current: false }
    const threshold = 80

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current) return
      const currentY = e.touches[0].clientY
      const distance = currentY - startYRef.current
      if (distance > 0 && distance < 150) {
        setPullDistance(distance)
        setPullToRefreshState('pulling')
      }
    }

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return
      isPullingRef.current = false
      setPullDistance((prev) => {
        if (prev >= threshold) {
          setPullToRefreshState('refreshing')
          setRefreshVersion((v) => v + 1)
          setTimeout(() => {
            setPullToRefreshState('idle')
            setPullDistance(0)
          }, 1000)
        } else {
          setPullToRefreshState('idle')
        }
        return prev >= threshold ? prev : 0
      })
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])
  // Withdrawal cooldown countdown ticker
  useEffect(() => {
    if (!summary?.nextWithdrawAt) {
      const timer = setTimeout(() => setWithdrawCooldownRemaining(0), 0)
      return () => clearTimeout(timer)
    }
    const target = Number(summary.nextWithdrawAt)
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      const remaining = Math.max(0, target - now)
      setWithdrawCooldownRemaining(remaining)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [summary?.nextWithdrawAt])

  // Scroll-reveal: observe all .reveal-on-scroll elements
  useEffect(() => {
    if (loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    )
    const timer = setTimeout(() => {
      const targets = document.querySelectorAll('.reveal-on-scroll:not(.is-visible)')
      targets.forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
          el.classList.add('is-visible')
        } else {
          observer.observe(el)
        }
      })
    }, 150)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [loading, investments.length])

  async function connectWallet() {
    setError('')
    try {
      const provider = window.ethereum
      if (!provider) throw new Error('Install a browser wallet such as MetaMask to connect.')
      const chainId = BigInt(await provider.request({ method: 'eth_chainId' }) as string)
      if (chainId !== BigInt(bsc.id)) {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] })
        } catch (switchError) {
          if ((switchError as { code?: number }).code !== 4902) throw switchError
          await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com'] }] })
        }
      }
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error('The wallet did not return a valid address.')
      setAccount(getAddress(accounts[0]))
    } catch (connectError) {
      const msg = readableError(connectError)
      setError(msg)
      addToast('error', msg)
    }
  }

  async function walletClient() {
    const provider = window.ethereum
    if (!provider || !account) throw new Error('Connect a wallet before sending a transaction.')
    return createWalletClient({ account, chain: bsc, transport: custom(provider as never) })
  }

  async function approveToken(spenderAmount: bigint) {
    if (!account || !isAddress(tokenAddress)) throw new Error('Enter a valid payment-token address first.')
    if (tokenAllowed !== true) throw new Error('This token is not confirmed as allowed by the contract.')
    const token = getAddress(tokenAddress)
    const current = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, CONTRACT_ADDRESS] })
    if (current >= spenderAmount) return
    const client = await walletClient()
    const approvalHash = await client.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [CONTRACT_ADDRESS, spenderAmount] })
    setTxHash(approvalHash)
    setNotice('Approval submitted. Waiting for confirmation...')
    await publicClient.waitForTransactionReceipt({ hash: approvalHash })
  }

  async function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    setTxHash('')
    try {
      if (!account) throw new Error('Connect your wallet first.')
      if (!terms || terms.paused) throw new Error('Contract actions are currently unavailable.')
      if (action === 'register' && summary?.registered) throw new Error('This wallet is already registered.')
      const token = isAddress(tokenAddress) ? getAddress(tokenAddress) : null

      // Validate specific inputs first
      if (action === 'register') {
        if (!token || !isAddress(referrer)) throw new Error('Enter a valid payment token and referrer address.')
        const referrerAddress = getAddress(referrer)
        if (referrerAddress !== '0x0000000000000000000000000000000000000000') {
          const referrerSummary = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getUserSummary', args: [referrerAddress] }) as unknown as UserSummary
          if (!referrerSummary.registered) throw new Error('Referrer is not registered. Use 0x0...0 for the first/root registration, or an already-registered account.')
        }
      } else if (action === 'invest') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        const value = parseUnits(amount, tokenDecimals)
        const minInvest = terms.minInvest / tokenScale
        const maxInvest = terms.maxInvest / tokenScale
        if (value < minInvest || value > maxInvest) throw new Error(`Amount must be between ${prettyAmount(minInvest, tokenDecimals)} and ${prettyAmount(maxInvest, tokenDecimals)} ${tokenSymbol}.`)
      } else if (action === 'withdraw') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
      } else if (action === 'reinvest') {
        if (!amount) throw new Error('Enter an amount to reinvest.')
      }

      // Build confirmation modal details
      let details = ''
      let fee = ''
      if (action === 'register') {
        details = `Register with plan ${planNames[Number(plan)]} using ${tokenSymbol}. Referrer: ${referrerMode === 'root' ? '0x0...0 (root)' : shortAddress(referrer)}`
        fee = `${prettyAmount(terms.registrationFee / tokenScale, tokenDecimals)} ${tokenSymbol} (registration fee)`
      } else if (action === 'invest') {
        details = `Invest ${amount} ${tokenSymbol}.`
      } else if (action === 'withdraw') {
        details = `Withdraw ${amount} ${tokenSymbol}. Available: ${prettyAmount(summary?.withdrawable, unitDecimals)} contract units.`
      } else if (action === 'reinvest') {
        const reinvestFee = (parseUnits(amount, 18) * 100n) / 10000n
        details = `Reinvest ${amount} units. A 1% fee (${prettyAmount(reinvestFee, 18)} units) will be deducted.`
        fee = `${prettyAmount(reinvestFee, 18)} units (1% fee)`
      } else {
        details = `Upgrade to Plan 3x (auto-upgrade). Requires ${upgradeDirectsNeeded} directs.`
      }

      setConfirmModal({
        action,
        amount,
        token: token ?? '',
        tokenSymbol,
        fee,
        details,
      })
      setBusy(false)
      return
    } catch (actionError) {
      const msg = readableError(actionError)
      setError(msg)
      addToast('error', msg)
      setBusy(false)
    }
  }

  async function executeConfirmedAction() {
    if (!confirmModal) return
    setBusy(true)
    setError('')
    setNotice('')
    setTxHash('')
    setConfirmModal(null)
    try {
      const client = await walletClient()
      const token = isAddress(tokenAddress) ? getAddress(tokenAddress) : null
      let hash: `0x${string}`

      if (confirmModal.action === 'register') {
        if (!token) throw new Error('Enter a valid payment token and referrer address.')
        await approveToken(terms!.registrationFee / tokenScale)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'register', args: [getAddress(referrer), Number(plan), token] })
      } else if (confirmModal.action === 'invest') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        const value = parseUnits(amount, tokenDecimals)
        await approveToken(value)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'invest', args: [parseUnits(amount, 18), token] })
      } else if (confirmModal.action === 'withdraw') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'withdraw', args: [token, parseUnits(amount, tokenDecimals)] })
      } else if (confirmModal.action === 'reinvest') {
        if (!amount) throw new Error('Enter an amount to reinvest.')
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'reinvest', args: [parseUnits(amount, 18)] })
      } else {
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'upgradePlan', args: [Number(plan)] })
      }

      setTxHash(hash)
      setNotice('Transaction submitted. Waiting for BNB Smart Chain confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      setNotice('Transaction confirmed.')
      addToast('success', `${confirmModal.action.charAt(0).toUpperCase() + confirmModal.action.slice(1)} transaction confirmed!`)
      const record: TxRecord = {
        type: confirmModal.action,
        hash,
        amount: amount || (confirmModal.action === 'register' ? terms?.registrationFee?.toString() ?? '' : ''),
        token: confirmModal.action === 'reinvest' ? 'units' : tokenSymbol,
        // eslint-disable-next-line react-hooks/purity
        timestamp: Date.now(),
      }
      setTxHistory((prev) => [record, ...prev].slice(0, 50))
      setAmount('')
      setRefreshVersion((version) => version + 1)
    } catch (actionError) {
      const msg = readableError(actionError)
      setError(msg)
      addToast('error', msg)
    } finally {
      setBusy(false)
    }
  }

  function cancelTransaction() {
    setConfirmModal(null)
    setBusy(false)
  }

  const planNames: Record<number, string> = { 0: '2x', 2: '3x', 1: '2.5x' }
  const eligiblePlans = terms ? terms.plans.filter((id) => id === 0 || id === 1) : [0, 1]
  const plan3xId = terms?.plans.find((id) => id === 2) ?? 2
  const upgradeDirectsNeeded = terms ? Number(terms.minDirects[plan3xId] ?? 10n) : 10
  const userPlan = summary?.plan
  const is2x = userPlan === 0
  const is25x = userPlan === 1
  const is3x = userPlan === 2
  const directs = Number(summary?.directCount ?? 0n)
  const upgradeReady = is25x && directs >= upgradeDirectsNeeded
  const planRows = [...eligiblePlans]
  const unitDecimals = terms?.unit.toString().length ? terms.unit.toString().length - 1 : 18
  const tokenScale = 10n ** BigInt(Math.max(0, 18 - tokenDecimals))
  const selectedTab = (next: Action) => {
    setAction(next)
    setNotice('')
    setError('')
    if (next === 'withdraw' && tokenAddress.toLowerCase() === '0x5c0d286f3812da7f6bd766b7aadadc7059938de8') {
      setTokenAddress(PAYMENT_TOKENS[0].address)
    }
  }

  const changeView = (next: View) => {
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Toast notification system
  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now()
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }
  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }
  const submitDisabled =
    busy ||
    !account ||
    loading ||
    Boolean(terms?.paused) ||
    (action === 'register' && Boolean(summary?.registered)) ||
    (action === 'upgrade' && !upgradeReady) ||
    (action === 'withdraw' && withdrawCooldownRemaining > 0)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Dexmitra dashboard">
          <span className="brand-mark"><Landmark size={16} strokeWidth={2} /></span>
          <span>dexmitra<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <button type="button" className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <a className="network-pill" href="https://bscscan.com" target="_blank" rel="noreferrer">
            <span className="network-dot" /> BNB Chain <ExternalLink size={12} />
          </a>
          {account ? (
            <button className="wallet-button connected" type="button" onClick={() => setAccount(null)} title="Disconnect wallet">
              <span className="wallet-dot" />{shortAddress(account)}<ChevronDown size={12} />
            </button>
          ) : (
            <button className="wallet-button" type="button" onClick={() => void connectWallet()}><Wallet size={14} /> Connect wallet</button>
          )}
        </div>
      </header>

      {/* Pull-to-refresh indicator (mobile) */}
      {pullToRefreshState !== 'idle' && (
        <div className={`pull-to-refresh ${pullToRefreshState}`}>
          <div className="pull-to-refresh-spinner" style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
          <span className="pull-to-refresh-text">
            {pullToRefreshState === 'pulling' ? (pullDistance >= 80 ? 'Release to refresh' : 'Pull to refresh') : 'Refreshing...'}
          </span>
        </div>
      )}

      {/* Hamburger Menu Overlay */}
      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="menu-header">
              <span className="brand-mark"><Landmark size={16} strokeWidth={2} /></span>
              <span className="menu-title">dexmitra.</span>
              <button type="button" className="menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <nav className="menu-nav">
              <button type="button" className={`menu-item ${view === 'dashboard' ? 'is-active' : ''}`} onClick={() => changeView('dashboard')}>
                <span className="menu-item-icon"><Landmark size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Dashboard</span>
              </button>
              <button type="button" className={`menu-item ${view === 'positions' ? 'is-active' : ''}`} onClick={() => changeView('positions')}>
                <span className="menu-item-icon"><ArrowDownLeft size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Positions</span>
              </button>
              <button type="button" className={`menu-item ${view === 'plans' ? 'is-active' : ''}`} onClick={() => changeView('plans')}>
                <span className="menu-item-icon"><ExternalLink size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Plans</span>
              </button>
              <button type="button" className={`menu-item ${view === 'analytics' ? 'is-active' : ''}`} onClick={() => changeView('analytics')}>
                <span className="menu-item-icon"><RefreshCw size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Analytics</span>
              </button>
              <button type="button" className={`menu-item ${view === 'activity' ? 'is-active' : ''}`} onClick={() => changeView('activity')}>
                <span className="menu-item-icon"><Check size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Activity</span>
              </button>
              <button type="button" className={`menu-item ${view === 'account' ? 'is-active' : ''}`} onClick={() => changeView('account')}>
                <span className="menu-item-icon"><Wallet size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Account</span>
              </button>
              <button type="button" className={`menu-item ${view === 'referral' ? 'is-active' : ''}`} onClick={() => changeView('referral')}>
                <span className="menu-item-icon"><ExternalLink size={16} strokeWidth={1.8} /></span>
                <span className="menu-item-label">Referral</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      <main id="top" className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ACCOUNT CONSOLE <span>·</span> BSC MAINNET</p>
            <h1>Dashboard</h1>
          </div>
          <button className="icon-button refresh-button" type="button" onClick={() => setRefreshVersion((version) => version + 1)} aria-label="Refresh contract data" title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>

        <section id="contract-section" className="contract-strip reveal-on-scroll" aria-label="Contract address">
          <span className="contract-label">Contract</span>
          <code>{CONTRACT_ADDRESS}</code>
          <button
            type="button"
            className={`contract-copy-btn ${copiedAddress ? 'copied' : ''}`}
            onClick={() => {
              navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
                setCopiedAddress(true)
                setTimeout(() => setCopiedAddress(false), 2000)
              }).catch(() => {})
            }}
            aria-label="Copy contract address"
            title="Copy contract address"
          >
            {copiedAddress ? <Check size={12} /> : <ExternalLink size={12} />}
            {copiedAddress ? 'Copied!' : 'Copy'}
          </button>
          <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" aria-label="Open contract on BscScan"><ExternalLink size={13} /></a>
          <span className="contract-balance"><span className="contract-label">Contract</span> USDT {prettyAmount(contractUsdtBalance ?? undefined, 18)} · GC {prettyAmount(contractGcBalance ?? undefined, 6)}</span>
          {account && <span className="wallet-balance"><span className="contract-label">Your wallet</span> USDT {prettyAmount(walletUsdtBalance ?? undefined, 18)} · GC {prettyAmount(walletGcBalance ?? undefined, 6)}</span>}
          <span className={`status-chip ${terms?.paused ? 'is-paused' : 'is-live'}`}><span />{terms?.paused ? 'Paused' : 'Contract active'}</span>
        </section>

        {account && summary && (
          <div className="member-since">
            <span className="member-since-label">Member since</span>
            <span className="member-since-value">{formatJoinedAt(summary.joinedAt)}</span>
          </div>
        )}

        {terms?.paused && <div className="feedback paused-feedback" role="alert"><ShieldAlert size={16} /><span>Contract is paused. New transactions are disabled. Existing positions are safe.</span></div>}
        {error && <div className="feedback error-feedback" role="alert"><BadgeAlert size={16} /><span>{error}</span><button type="button" className="feedback-retry-btn" onClick={() => { setError(''); setLoadRetry((v) => v + 1) }}>Retry</button><button type="button" onClick={() => setError('')} aria-label="Dismiss"><span aria-hidden="true">×</span></button></div>}
        {notice && <div className="feedback success-feedback" role="status"><Check size={16} /><span>{notice} {txHash && <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}</span></div>}

        {view === 'dashboard' && <section id="metrics-section" className="metrics" aria-label="Account summary">
          <article className="metric metric-primary reveal-on-scroll">
            <div className="metric-label">TOTAL INVESTED <span title="Value reported by the contract."><CircleHelp size={12} aria-label="Value reported by the contract" /></span></div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.totalInvested ?? 0n} decimals={unitDecimals} />}<small>$</small></div>
          </article>
          <article className="metric reveal-on-scroll">
            <div className="metric-label">ACTIVE PRINCIPAL</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.activeInvested ?? 0n} decimals={unitDecimals} />}<small>$</small></div>
          </article>
          <article className="metric metric-earn reveal-on-scroll">
            <div className="metric-label">WITHDRAWABLE</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.withdrawable ?? 0n} decimals={unitDecimals} />}<small>$</small></div>
          </article>
          <article className="metric metric-earn reveal-on-scroll">
            <div className="metric-label">PENDING ROI</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.pendingRoi ?? 0n} decimals={unitDecimals} />}<small>$</small></div>
          </article>
        </section>}

        <div className={`workspace-grid ${view === 'account' ? '' : 'workspace-grid--single'}`}>
          <div className="left-column">
            {view === 'positions' && (
<section id="positions-section" className="data-section positions-section reveal-on-scroll">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PORTFOLIO</p>
                  <h2>Investment positions</h2>
                </div>
                <span className="count-pill">{investments.length} total · {investments.filter((item) => item.active).length} active</span>
              </div>
              {!account ? (
                <EmptyState icon={<Wallet size={24} />} title="Connect a wallet" description="Your investment positions will appear here once you connect." cta="Connect wallet" onCta={() => void connectWallet()} />
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading on-chain positions…</span></div>
              ) : investments.length === 0 ? (
                <EmptyState icon={<ArrowDownLeft size={24} />} title="No positions yet" description="This wallet has no investment records in the contract." cta="Make your first investment" onCta={() => selectedTab('invest')} />
              ) : (
                <div className="positions-grid">
                  {investments.map((item, index) => {
                    const earnedTotal = item.earned + item.otherEarned
                    const capPct = item.cap > 0n ? Math.min(100, Math.round((Number(earnedTotal) / Number(item.cap)) * 100)) : 0
                    return (
                      <div key={`${item.startedAt}-${index}`} className={`position-card reveal-on-scroll ${!item.active ? 'is-closed' : ''}`}>
                        <div className="position-header">
                          <div className="position-id-row">
                            <span className="position-badge">#{investments.length - index}</span>
                            <span className="position-date">{new Date(Number(item.startedAt) * 1000).toLocaleDateString()}</span>
                          </div>
                          <span className={`status-pill ${item.active ? 'is-active' : 'is-closed'}`}>{item.active ? 'Active' : 'Closed'}</span>
                        </div>
                        <div className="position-stats">
                          <div className="stat-col">
                            <span className="stat-label">PRINCIPAL</span>
                            <span className="stat-value">{prettyAmount(item.amount, unitDecimals)} units</span>
                          </div>
                          <div className="stat-col">
                            <span className="stat-label">EARNED</span>
                            <span className="stat-value stat-value-earned">{prettyAmount(earnedTotal, unitDecimals)} units</span>
                          </div>
                          <div className="stat-col">
                            <span className="stat-label">MAX CAP</span>
                            <span className="stat-value">{prettyAmount(item.cap, unitDecimals)} units</span>
                          </div>
                        </div>
                        <div className="progress-row">
                          <div className="progress-label-row">
                            <span className="progress-label">ROI Cap Progress</span>
                            <span className="progress-value">{capPct}% ({prettyAmount(earnedTotal, unitDecimals)} / {prettyAmount(item.cap, unitDecimals)} units)</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: capPct + '%' }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {investments.length > 1 && (
                <div className="positions-swipe-dots">
                  {investments.map((_, i) => (
                    <span key={i} className="positions-swipe-dot" />
                  ))}
                </div>
              )}
            </section>
)}

            {view === 'plans' && (
<section id="plan-params-section" className="data-section terms-section reveal-on-scroll">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">READ FROM CONTRACT</p>
                  <h2>Plan parameters</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              <div className="tiers-grid">
                {planRows.map((planId) => (
                  <div key={planId} className={`tier-card reveal-on-scroll ${is3x && planId === 2 ? 'is-current' : ''}`}>
                    <div className="tier-header">
                      <span className="plan-name-badge">PLAN {planNames[planId]}</span>
                      <span className="directs-pill">Directs required: {terms ? String(terms.minDirects[planId]) : '—'}</span>
                    </div>
                    <div className="tier-metrics">
                      <div className="tier-metric">
                        <span className="tier-metric-label">MULTIPLIER</span>
                        <span className="tier-metric-value">{terms ? (Number(terms.multiplierBps[planId]) / 10000).toFixed(2) + 'x' : '—'}</span>
                      </div>
                      <div className="tier-metric">
                        <span className="tier-metric-label">MONTHLY RATE</span>
                        <span className="tier-metric-value tier-metric-value-earn">{terms ? (Number(terms.roiBps[planId]) / 100).toFixed(2) + '%' : '—'}</span>
                      </div>
                      <div className="tier-metric">
                        <span className="tier-metric-label">DAILY RATE</span>
                        <span className="tier-metric-value">{terms ? (Number(terms.roiBps[planId]) / 3000).toFixed(4) + '%' : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!terms && <div className="tier-unavailable">Plan data unavailable.</div>}
              </div>
              <div className="upgrade-note">
                <CircleHelp size={13} />
                <span>
                  {is3x
                    ? '3x was an auto-upgrade (2.5x → 3x reached). Your current plan is 3x.'
                    : is2x
                      ? '2x is final — it cannot be upgraded. 2.5x auto-upgrades to 3x.'
                      : is25x
                        ? `2.5x → 3x auto-upgrade at ${upgradeDirectsNeeded} directs. You have ${directs}.`
                        : `2.5x → 3x auto-upgrade at ${upgradeDirectsNeeded} directs. 2x is final.`}
                </span>
              </div>
              <p className="terms-note"><CircleHelp size={13} /> Rates and caps are contract parameters, not promises of payment.</p>
            </section>
)}

            {view === 'dashboard' && (
<section id="health-score-section" className="data-section health-score-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PORTFOLIO HEALTH</p>
                  <h2>Health score</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view health score</strong><span>Your portfolio health will appear here.</span></div>
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading…</span></div>
              ) : (
                <>
                  <div className="health-gauge-wrap">
                    <svg viewBox="0 0 200 200" className="health-gauge">
                      {(() => {
                        const activeCount = investments.filter((i) => i.active).length
                        const totalCount = investments.length
                        const activeRatio = totalCount > 0 ? (activeCount / totalCount) * 100 : 0
                        const cap = Number(summary?.incomeCap ?? 0n)
                        const earned = Number(summary?.capEarned ?? 0n)
                        const capUtilization = cap > 0 ? Math.min(100, (earned / cap) * 100) : 0
                        const capHeadroom = 100 - capUtilization
                        const invested = Number(summary?.totalInvested ?? 0n)
                        const withdrawable = Number(summary?.withdrawable ?? 0n)
                        const withdrawableRatio = invested > 0 ? Math.min(100, (withdrawable / invested) * 100) : 0
                        const score = Math.round(activeRatio * 0.4 + capHeadroom * 0.3 + withdrawableRatio * 0.3)
                        const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
                        const r = 70
                        const circumference = 2 * Math.PI * r
                        const dash = (score / 100) * circumference
                        const gap = circumference - dash
                        return (
                          <>
                            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                            <circle
                              cx="100" cy="100" r={r}
                              fill="none"
                              stroke={color}
                              strokeWidth="18"
                              strokeDasharray={`${dash} ${gap}`}
                              transform="rotate(-90 100 100)"
                              strokeLinecap="round"
                              style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
                            />
                            <text x="100" y="90" textAnchor="middle" className="health-gauge-score" style={{ fill: color }}>{score}</text>
                            <text x="100" y="110" textAnchor="middle" className="health-gauge-label">Health Score</text>
                          </>
                        )
                      })()}
                    </svg>
                    <div className="health-gauge-legend">
                      <div className="health-gauge-factor">
                        <span className="health-gauge-factor-label">Active positions</span>
                        <span className="health-gauge-factor-weight">40%</span>
                        <span className="health-gauge-factor-value">
                          {investments.length > 0 ? Math.round((investments.filter((i) => i.active).length / investments.length) * 100) : 0}%
                        </span>
                      </div>
                      <div className="health-gauge-factor">
                        <span className="health-gauge-factor-label">Cap headroom</span>
                        <span className="health-gauge-factor-weight">30%</span>
                        <span className="health-gauge-factor-value">
                          {summary?.incomeCap && summary.incomeCap > 0n ? Math.round((1 - Number(summary.capEarned) / Number(summary.incomeCap)) * 100) : 0}%
                        </span>
                      </div>
                      <div className="health-gauge-factor">
                        <span className="health-gauge-factor-label">Withdrawable ratio</span>
                        <span className="health-gauge-factor-weight">30%</span>
                        <span className="health-gauge-factor-value">
                          {summary?.totalInvested && summary.totalInvested > 0n ? Math.min(100, Math.round((Number(summary.withdrawable) / Number(summary.totalInvested)) * 100)) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="terms-note"><CircleHelp size={13} /> Health score combines active positions, cap headroom, and withdrawable ratio. Not a financial assessment.</p>
                </>
              )}
            </section>
)}

            {view === 'plans' && (
<section id="plan-compare-section" className="data-section plan-compare-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PLAN COMPARISON</p>
                  <h2>Choose your plan</h2>
                </div>
              </div>
              {terms ? (
                <div className="plan-compare-grid">
                  <div className={`plan-compare-card ${is2x ? 'is-current' : ''}`}>
                    <div className="plan-compare-header">
                      <span className="plan-compare-name">Plan 2x</span>
                      {is2x && <span className="plan-compare-current">Current</span>}
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Monthly ROI</span>
                      <span className="plan-compare-metric-value">{(Number(terms.roiBps[0]) / 100).toFixed(2)}%</span>
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Cap multiplier</span>
                      <span className="plan-compare-metric-value">{(Number(terms.multiplierBps[0]) / 10000).toFixed(2)}x</span>
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Directs needed</span>
                      <span className="plan-compare-metric-value">{String(terms.minDirects[0])}</span>
                    </div>
                    <div className="plan-compare-footer">
                      <span className="plan-compare-footer-text">Final plan — cannot be upgraded</span>
                    </div>
                  </div>
                  <div className={`plan-compare-card ${is25x || is3x ? 'is-current' : ''}`}>
                    <div className="plan-compare-header">
                      <span className="plan-compare-name">Plan 2.5x</span>
                      {(is25x || is3x) && <span className="plan-compare-current">{is3x ? 'Upgraded to 3x' : 'Current'}</span>}
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Monthly ROI</span>
                      <span className="plan-compare-metric-value plan-compare-metric-value-earn">{(Number(terms.roiBps[1]) / 100).toFixed(2)}%</span>
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Cap multiplier</span>
                      <span className="plan-compare-metric-value plan-compare-metric-value-earn">{(Number(terms.multiplierBps[1]) / 10000).toFixed(2)}x</span>
                    </div>
                    <div className="plan-compare-metric">
                      <span className="plan-compare-metric-label">Directs needed</span>
                      <span className="plan-compare-metric-value">{String(terms.minDirects[1])} (auto-upgrades to 3x at 10)</span>
                    </div>
                    <div className="plan-compare-footer">
                      <span className="plan-compare-footer-text">Auto-upgrades to 3x at {upgradeDirectsNeeded} directs</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state"><CircleHelp size={18} /><strong>Plan data unavailable</strong><span>Contract terms could not be loaded.</span></div>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Plan 2x is final. Plan 2.5x auto-upgrades to 3x at 10 directs. Rates and caps are contract parameters.</p>
            </section>
)}

            {view === 'plans' && (
<section className="data-section upgrade-progress-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PLAN PROGRESS</p>
                  <h2>Upgrade to 3x</h2>
                </div>
                {upgradeReady && <span className="count-pill">Eligible</span>}
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view upgrade progress</strong><span>Your direct referral progress will appear here.</span></div>
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading…</span></div>
              ) : (
                <>
                  <div className="upgrade-progress-card">
                    <div className="upgrade-progress-header">
                      <div className="upgrade-plan-info">
                        <span className="upgrade-plan-name">{is3x ? 'Plan 3x' : is25x ? 'Plan 2.5x' : 'Plan 2x'}</span>
                        <span className="upgrade-plan-status">
                          {is3x ? 'Max tier reached' : is25x ? 'Auto-upgrades at 10 directs' : 'Final plan — cannot upgrade'}
                        </span>
                      </div>
                      {upgradeReady && (
                        <span className="upgrade-check-badge">
                          <Check size={14} /> Eligible
                        </span>
                      )}
                    </div>
                    {is25x && (
                      <>
                        <div className="upgrade-progress-bar-wrap">
                          <div className="upgrade-progress-bar">
                            <div className="upgrade-progress-fill" style={{ width: Math.min(100, (directs / upgradeDirectsNeeded) * 100) + '%' }} />
                          </div>
                          <div className="upgrade-progress-label">
                            <span>{directs} / {upgradeDirectsNeeded} directs</span>
                            <span>{Math.min(100, Math.round((directs / upgradeDirectsNeeded) * 100))}%</span>
                          </div>
                        </div>
                        <div className="upgrade-progress-details">
                          <div className="upgrade-detail">
                            <span className="upgrade-detail-label">Directs needed</span>
                            <span className="upgrade-detail-value">{upgradeDirectsNeeded}</span>
                          </div>
                          <div className="upgrade-detail">
                            <span className="upgrade-detail-label">Current directs</span>
                            <span className="upgrade-detail-value">{directs}</span>
                          </div>
                          <div className="upgrade-detail">
                            <span className="upgrade-detail-label">Remaining</span>
                            <span className="upgrade-detail-value">{Math.max(0, upgradeDirectsNeeded - directs)}</span>
                          </div>
                        </div>
                        {upgradeReady && (
                          <button
                            type="submit"
                            className="submit-button action-button-upgrade"
                            onClick={() => { setAction('upgrade'); selectedTab('upgrade') }}
                          >
                            <Check size={15} /> Confirm upgrade to 3x
                          </button>
                        )}
                      </>
                    )}
                    {is2x && (
                      <p className="form-hint">Plan 2x is final — it cannot be upgraded to 2.5x or 3x.</p>
                    )}
                    {is3x && (
                      <p className="form-hint">You are already on the highest tier (3x). No further upgrades available.</p>
                    )}
                  </div>
                </>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Plan upgrades are automatic when the direct threshold is met. 2x is final.</p>
            </section>
)}

            {view === 'analytics' && (
<section className="data-section chart-section reveal-on-scroll">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ANALYTICS</p>
                  <h2>Earnings breakdown</h2>
                </div>
                <div className="chart-tabs">
                  <button type="button" className={`chart-tab ${chartTab === 'breakdown' ? 'selected' : ''}`} onClick={() => setChartTab('breakdown')}>Breakdown</button>
                  <button type="button" className={`chart-tab ${chartTab === 'timeline' ? 'selected' : ''}`} onClick={() => setChartTab('timeline')}>Timeline</button>
                </div>
              </div>
              {!account ? (
                <EmptyState icon={<Wallet size={24} />} title="Connect a wallet" description="Earnings analytics will appear here once you connect." cta="Connect wallet" onCta={() => void connectWallet()} />
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading analytics…</span></div>
              ) : (
                chartTab === 'breakdown' ? (
                  <div className="chart-breakdown">
                    <div className="chart-donut-wrap">
                      <svg viewBox="0 0 200 200" className="chart-donut">
                        {(() => {
                          const roi = Number(summary?.totalEarned ?? 0n) - Number(summary?.directEarned ?? 0n) - Number(summary?.levelEarned ?? 0n)
                          const direct = Number(summary?.directEarned ?? 0n)
                          const level = Number(summary?.levelEarned ?? 0n)
                          const total = roi + direct + level
                          if (total === 0) return <circle cx="100" cy="100" r="70" fill="none" stroke="var(--line)" strokeWidth="24" />
                          const cx = 100, cy = 100, r = 70
                          const circumference = 2 * Math.PI * r
                          const segments = [
                            { value: roi, color: '#10b981', label: 'ROI' },
                            { value: direct, color: '#3b82f6', label: 'Direct' },
                            { value: level, color: '#f59e0b', label: 'Level' },
                          ].filter(s => s.value > 0)
                          let offset = 0
                          return segments.map((seg, i) => {
                            const pct = seg.value / total
                            const dash = pct * circumference
                            const gap = circumference - dash
                            const currentOffset = offset
                            offset += dash
                            return (
                              <circle
                                key={i}
                                cx={cx} cy={cy} r={r}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth="24"
                                strokeDasharray={`${dash} ${gap}`}
                                strokeDashoffset={-currentOffset}
                                transform="rotate(-90 100 100)"
                                strokeLinecap="round"
                              />
                            )
                          })
                        })()}
                        <text x="100" y="95" textAnchor="middle" className="chart-donut-center-value">{prettyAmount(summary?.totalEarned, unitDecimals)}</text>
                        <text x="100" y="112" textAnchor="middle" className="chart-donut-center-label">Total Earned</text>
                      </svg>
                      <div className="chart-legend">
                        <div className="chart-legend-item">
                          <span className="chart-legend-dot" style={{ background: '#10b981' }} />
                          <span className="chart-legend-label">ROI Income</span>
                          <span className="chart-legend-value">{prettyAmount((summary?.totalEarned ?? 0n) - (summary?.directEarned ?? 0n) - (summary?.levelEarned ?? 0n), unitDecimals)}</span>
                        </div>
                        <div className="chart-legend-item">
                          <span className="chart-legend-dot" style={{ background: '#3b82f6' }} />
                          <span className="chart-legend-label">Direct Income</span>
                          <span className="chart-legend-value">{prettyAmount(summary?.directEarned, unitDecimals)}</span>
                        </div>
                        <div className="chart-legend-item">
                          <span className="chart-legend-dot" style={{ background: '#f59e0b' }} />
                          <span className="chart-legend-label">Level Income</span>
                          <span className="chart-legend-value">{prettyAmount(summary?.levelEarned, unitDecimals)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="chart-stats-row">
                      <div className="chart-stat">
                        <span className="chart-stat-label">Total Earned</span>
                        <span className="chart-stat-value">{prettyAmount(summary?.totalEarned, unitDecimals)}</span>
                      </div>
                      <div className="chart-stat">
                        <span className="chart-stat-label">Withdrawable</span>
                        <span className="chart-stat-value">{prettyAmount(summary?.withdrawable, unitDecimals)}</span>
                      </div>
                      <div className="chart-stat">
                        <span className="chart-stat-label">Total Withdrawn</span>
                        <span className="chart-stat-value">{prettyAmount(summary?.totalWithdrawn, unitDecimals)}</span>
                      </div>
                      <div className="chart-stat">
                        <span className="chart-stat-label">Pending ROI</span>
                        <span className="chart-stat-value">{prettyAmount(summary?.pendingRoi, unitDecimals)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="chart-timeline">
                    {investments.length === 0 ? (
                      <div className="empty-state"><ArrowDownLeft size={18} /><strong>No positions found</strong><span>Investments will appear here once made.</span></div>
                    ) : (
                      <div className="timeline-list">
                        {investments.map((item, index) => {
                          const earnedTotal = item.earned + item.otherEarned
                          const capPct = item.cap > 0n ? Math.min(100, Math.round((Number(earnedTotal) / Number(item.cap)) * 100)) : 0
                          return (
                            <div key={`${item.startedAt}-${index}`} className="timeline-item">
                              <div className="timeline-dot" />
                              <div className="timeline-content">
                                <div className="timeline-header">
                                  <span className="timeline-position">Position #{investments.length - index}</span>
                                  <span className="timeline-date">{new Date(Number(item.startedAt) * 1000).toLocaleDateString()}</span>
                                </div>
                                <div className="timeline-bar">
                                  <div className="timeline-bar-fill" style={{ width: capPct + '%' }} />
                                </div>
                                <div className="timeline-stats">
                                  <span>Principal: {prettyAmount(item.amount, unitDecimals)}</span>
                                  <span>Earned: {prettyAmount(earnedTotal, unitDecimals)}</span>
                                  <span>Cap: {prettyAmount(item.cap, unitDecimals)}</span>
                                  <span className="timeline-pct">{capPct}%</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              )}
              <p className="terms-note"><CircleHelp size={13} /> Analytics based on on-chain contract data. Not a guarantee of future returns.</p>
            </section>
)}

            {view === 'analytics' && (
<section id="levels-section" className="data-section levels-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DOWNLINE NETWORK</p>
                  <h2>Level business</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <EmptyState icon={<Wallet size={24} />} title="Connect a wallet" description="Level business and income data will appear here once you connect." cta="Connect wallet" onCta={() => void connectWallet()} />
              ) : levelBusiness.length === 0 ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading level data…</span></div>
              ) : (
                <>
                  <div className="levels-grid">
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((level) => {
                      const business = levelBusiness[level] ?? 0n
                      const earned = levelEarned[level] ?? 0n
                      const pct = levelPercentages[level] ?? 0n
                      const maxBusiness = Math.max(...levelBusiness.slice(1).map(Number), 1)
                      const barWidth = business > 0n ? Math.max(4, Math.round((Number(business) / maxBusiness) * 100)) : 0
                      return (
                        <div key={level} className="level-row">
                          <div className="level-badge">L{level}</div>
                          <div className="level-info">
                            <div className="level-bar-row">
                              <div className="level-bar-track">
                                <div className="level-bar-fill" style={{ width: barWidth + '%' }} />
                              </div>
                              <span className="level-pct">{(Number(pct) / 100).toFixed(2)}%</span>
                            </div>
                            <div className="level-stats">
                              <span className="level-stat"><span className="level-stat-label">Business</span> {prettyAmount(business, unitDecimals)}</span>
                              <span className="level-stat"><span className="level-stat-label">Earned</span> {prettyAmount(earned, unitDecimals)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="level-summary">
                    <div className="level-summary-item">
                      <span className="level-summary-label">Total Level Business</span>
                      <span className="level-summary-value">{prettyAmount(levelBusiness.slice(1).reduce((a, b) => a + b, 0n), unitDecimals)}</span>
                    </div>
                    <div className="level-summary-item">
                      <span className="level-summary-label">Total Level Earned</span>
                      <span className="level-summary-value">{prettyAmount(levelEarned.slice(1).reduce((a, b) => a + b, 0n), unitDecimals)}</span>
                    </div>
                    <div className="level-summary-item">
                      <span className="level-summary-label">Direct Count</span>
                      <span className="level-summary-value">{summary?.directCount?.toString() ?? '0'}</span>
                    </div>
                  </div>
                </>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Level income pays % of downline ROI. Level N requires N direct referrals. Max 20 tokens/level/day.</p>
            </section>
)}

            {view === 'analytics' && (
<section id="cap-gauge-section" className="data-section cap-gauge-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">CAP UTILIZATION</p>
                  <h2>Earnings progress</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <EmptyState icon={<Wallet size={24} />} title="Connect a wallet" description="Your earnings progress will appear here once you connect." cta="Connect wallet" onCta={() => void connectWallet()} />
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading…</span></div>
              ) : !terms ? (
                <div className="empty-state"><CircleHelp size={18} /><strong>Plan data unavailable</strong><span>Contract terms could not be loaded.</span></div>
              ) : (
                <>
                  <div className="cap-gauge-wrap">
                    <svg viewBox="0 0 200 200" className="cap-gauge">
                      {(() => {
                        const cap = Number(summary?.incomeCap ?? 0n)
                        const earned = Number(summary?.capEarned ?? 0n)
                        const pct = cap > 0 ? Math.min(100, Math.round((earned / cap) * 100)) : 0
                        const color = pct < 50 ? '#10b981' : pct < 80 ? '#f59e0b' : '#ef4444'
                        const r = 70
                        const circumference = 2 * Math.PI * r
                        const dash = (pct / 100) * circumference
                        const gap = circumference - dash
                        return (
                          <>
                            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                            <circle
                              cx="100" cy="100" r={r}
                              fill="none"
                              stroke={color}
                              strokeWidth="18"
                              strokeDasharray={`${dash} ${gap}`}
                              transform="rotate(-90 100 100)"
                              strokeLinecap="round"
                              style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
                            />
                            <text x="100" y="90" textAnchor="middle" className="cap-gauge-pct" style={{ fill: color }}>{pct}%</text>
                            <text x="100" y="110" textAnchor="middle" className="cap-gauge-label">Utilized</text>
                          </>
                        )
                      })()}
                    </svg>
                    <div className="cap-gauge-legend">
                      <div className="cap-gauge-stat">
                        <span className="cap-gauge-stat-label">Income Cap</span>
                        <span className="cap-gauge-stat-value">{prettyAmount(summary?.incomeCap, unitDecimals)}</span>
                      </div>
                      <div className="cap-gauge-stat">
                        <span className="cap-gauge-stat-label">Earned</span>
                        <span className="cap-gauge-stat-value">{prettyAmount(summary?.capEarned, unitDecimals)}</span>
                      </div>
                      <div className="cap-gauge-stat">
                        <span className="cap-gauge-stat-label">Remaining</span>
                        <span className="cap-gauge-stat-value">{prettyAmount(summary?.remainingToEarn, unitDecimals)}</span>
                      </div>
                      <div className="cap-gauge-stat">
                        <span className="cap-gauge-stat-label">Active Positions</span>
                        <span className="cap-gauge-stat-value">{summary?.activeInvestments?.toString() ?? '0'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="cap-gauge-bar">
                    <div className="cap-gauge-bar-track">
                      <div className="cap-gauge-bar-fill" style={{ width: (summary?.incomeCap && summary.incomeCap > 0n ? Math.min(100, Math.round((Number(summary.capEarned) / Number(summary.incomeCap)) * 100)) : 0) + '%' }} />
                    </div>
                    <div className="cap-gauge-bar-labels">
                      <span>0</span>
                      <span>{prettyAmount(summary?.incomeCap, unitDecimals)} units cap</span>
                    </div>
                  </div>
                </>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Cap utilization shows how much of your income cap has been earned. Green = healthy, amber = approaching, red = near cap.</p>
            </section>
)}

            {view === 'activity' && (
<section id="timeline-section" className="data-section timeline-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PORTFOLIO TIMELINE</p>
                  <h2>Investment timeline</h2>
                </div>
                <div className="chart-tabs">
                  <button type="button" className={`chart-tab ${timelineTab === 'positions' ? 'selected' : ''}`} onClick={() => setTimelineTab('positions')}>Positions</button>
                  <button type="button" className={`chart-tab ${timelineTab === 'events' ? 'selected' : ''}`} onClick={() => setTimelineTab('events')}>Events</button>
                </div>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view timeline</strong><span>Your investment timeline will appear here.</span></div>
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading timeline…</span></div>
              ) : timelineTab === 'positions' ? (
                investments.length === 0 ? (
                  <EmptyState icon={<ArrowDownLeft size={24} />} title="No positions yet" description="Your investment positions will appear here once you invest." cta="Make your first investment" onCta={() => selectedTab('invest')} />
                ) : (
                  <div className="timeline-list">
                    {investments.map((item, index) => {
                      const earnedTotal = item.earned + item.otherEarned
                      const capPct = item.cap > 0n ? Math.min(100, Math.round((Number(earnedTotal) / Number(item.cap)) * 100)) : 0

                      const estimatedDaysToCap = terms && terms.roiBps[Number(summary?.plan ?? 0)] > 0n
                        ? Math.ceil(Number(item.cap - earnedTotal) / (Number(item.amount) * Number(terms.roiBps[Number(summary?.plan ?? 0)]) / 10000 / 30))
                        : 0
                      return (
                        <div key={`${item.startedAt}-${index}`} className="timeline-item">
                          <div className="timeline-dot-wrap">
                            <div className={`timeline-dot ${item.active ? 'is-active' : 'is-closed'}`} />
                            {index < investments.length - 1 && <div className="timeline-connector" />}
                          </div>
                          <div className="timeline-content">
                            <div className="timeline-header">
                              <span className="timeline-position">Position #{investments.length - index}</span>
                              <span className="timeline-date">{new Date(Number(item.startedAt) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                            <div className="timeline-meta">
                              <span className="timeline-meta-item">
                                <span className="timeline-meta-label">Principal</span>
                                <span className="timeline-meta-value">{prettyAmount(item.amount, unitDecimals)} units</span>
                              </span>
                              <span className="timeline-meta-item">
                                <span className="timeline-meta-label">Earned</span>
                                <span className="timeline-meta-value timeline-meta-earned">{prettyAmount(earnedTotal, unitDecimals)} units</span>
                              </span>
                              <span className="timeline-meta-item">
                                <span className="timeline-meta-label">Cap</span>
                                <span className="timeline-meta-value">{prettyAmount(item.cap, unitDecimals)} units</span>
                              </span>
                              <span className="timeline-meta-item">
                                <span className="timeline-meta-label">Status</span>
                                <span className={`timeline-status ${item.active ? 'is-active' : 'is-closed'}`}>{item.active ? 'Active' : 'Closed'}</span>
                              </span>
                            </div>
                            <div className="timeline-bar">
                              <div className="timeline-bar-fill" style={{ width: capPct + '%' }} />
                            </div>
                            <div className="timeline-footer">
                              {item.active && estimatedDaysToCap > 0 && (
                                <span className="timeline-footer-text">~{estimatedDaysToCap} days to cap</span>
                              )}
                              {item.reinvest && <span className="timeline-reinvest-badge">Reinvested</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="timeline-events">
                  <div className="timeline-event">
                    <div className="timeline-event-dot" />
                    <div className="timeline-event-content">
                      <span className="timeline-event-title">Account registered</span>
                      <span className="timeline-event-date">{summary?.joinedAt ? new Date(Number(summary.joinedAt) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                    </div>
                  </div>
                  {investments.map((item, index) => (
                    <div key={`event-${item.startedAt}-${index}`} className="timeline-event">
                      <div className="timeline-event-dot" />
                      <div className="timeline-event-content">
                        <span className="timeline-event-title">{item.reinvest ? 'Reinvested' : 'Invested'} {prettyAmount(item.amount, unitDecimals)} units</span>
                        <span className="timeline-event-date">{new Date(Number(item.startedAt) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  ))}
                  {summary && summary.totalWithdrawn > 0n && (
                    <div className="timeline-event">
                      <div className="timeline-event-dot timeline-event-dot--withdraw" />
                      <div className="timeline-event-content">
                        <span className="timeline-event-title">Withdrew {prettyAmount(summary.totalWithdrawn, unitDecimals)} units total</span>
                        <span className="timeline-event-date">{summary.lastWithdraw ? new Date(Number(summary.lastWithdraw) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                      </div>
                    </div>
                  )}
                  {summary && summary.totalReinvested > 0n && (
                    <div className="timeline-event">
                      <div className="timeline-event-dot timeline-event-dot--reinvest" />
                      <div className="timeline-event-content">
                        <span className="timeline-event-title">Total reinvested: {prettyAmount(summary.totalReinvested, unitDecimals)} units (fees: {prettyAmount(summary.totalReinvestFees, unitDecimals)})</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Timeline based on on-chain investment records. Dates are approximate.</p>
            </section>
)}

            {view === 'activity' && (
<section id="tx-history-section" className="data-section tx-history-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TRANSACTION HISTORY</p>
                  <h2>Recent activity</h2>
                </div>
                {txHistory.length > 0 && <span className="count-pill">{txHistory.length} txs</span>}
              </div>
              {txHistory.length === 0 ? (
                <EmptyState icon={<RefreshCw size={24} />} title="No transactions yet" description="Your completed transactions will appear here after your first action." />
              ) : (
                <div className="tx-history-list">
                  {txHistory.map((tx, index) => (
                    <div key={`${tx.hash}-${index}`} className="tx-history-item">
                      <div className="tx-history-icon">
                        {tx.type === 'register' && <Wallet size={14} />}
                        {tx.type === 'invest' && <ArrowDownLeft size={14} />}
                        {tx.type === 'withdraw' && <ArrowUpRight size={14} />}
                        {tx.type === 'reinvest' && <RefreshCw size={14} />}
                        {tx.type === 'upgrade' && <Check size={14} />}
                      </div>
                      <div className="tx-history-content">
                        <div className="tx-history-header">
                          <span className="tx-history-type">{tx.type === 'upgrade' ? 'Upgrade Plan' : tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</span>
                          <span className="tx-history-date">{new Date(tx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="tx-history-details">
                          {tx.amount && <span className="tx-history-amount">{tx.amount} {tx.token}</span>}
                          <a href={`https://bscscan.com/tx/${tx.hash}`} target="_blank" rel="noreferrer" className="tx-history-hash">
                            {tx.hash.slice(0, 10)}…{tx.hash.slice(-8)} <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Transaction history is stored locally. Clearing browser data will reset this list.</p>
            </section>
)}

            {view === 'referral' && (
<section id="referral-section" className="data-section referral-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">REFERRAL NETWORK</p>
                  <h2>Invite & earn</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <EmptyState icon={<Wallet size={24} />} title="Connect a wallet" description="Your referral link and stats will appear here once you connect." cta="Connect wallet" onCta={() => void connectWallet()} />
              ) : (
                <>
                  <div className="referral-link-box">
                    <div className="referral-link-label">Your referral link</div>
                    <div className="referral-link-row">
                      <code className="referral-link-url">https://dexmitra.com?ref={shortAddress(account)}</code>
                      <button
                        type="button"
                        className={`referral-copy-btn ${copiedLink ? 'copied' : ''}`}
                        onClick={() => {
                          navigator.clipboard.writeText(`https://dexmitra.com?ref=${account}`).then(() => {
                            setCopiedLink(true)
                            setTimeout(() => setCopiedLink(false), 2000)
                          }).catch(() => {})
                        }}
                      >
                        {copiedLink ? <Check size={14} /> : <ExternalLink size={14} />}
                        {copiedLink ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="form-hint">Share this link. When someone registers using your address as referrer, you earn 40 direct income + level bonuses.</p>
                  </div>
                  <div className="referral-stats-grid">
                    <div className="referral-stat-card">
                      <span className="referral-stat-label">Direct Referrals</span>
                      <span className="referral-stat-value">{summary?.directCount ? summary.directCount.toString() : '0'}</span>
                    </div>
                    <div className="referral-stat-card">
                      <span className="referral-stat-label">Direct Income</span>
                      <span className="referral-stat-value">{prettyAmount(summary?.directEarned, unitDecimals)}</span>
                    </div>
                    <div className="referral-stat-card">
                      <span className="referral-stat-label">Level Income</span>
                      <span className="referral-stat-value">{prettyAmount(summary?.levelEarned, unitDecimals)}</span>
                    </div>
                    <div className="referral-stat-card">
                      <span className="referral-stat-label">Total Earned</span>
                      <span className="referral-stat-value">{prettyAmount(summary?.totalEarned, unitDecimals)}</span>
                    </div>
                  </div>
                  {summary && summary.directCount > 0n && (
                    <div className="referral-tier-info">
                      <CircleHelp size={13} />
                      <span>
                        {Number(summary.directCount) >= 10
                          ? 'You have 10+ directs — eligible for 3x auto-upgrade!'
                          : `You have ${summary.directCount.toString()} direct(s). Need 10 directs for 2.5x → 3x auto-upgrade.`}
                      </span>
                    </div>
                  )}
                </>
              )}
              <p className="terms-note"><CircleHelp size={13} /> Referral rewards are contract parameters, not promises of payment.</p>
            </section>
)}

          </div>

          {view === 'account' && <aside id="action-panel-section" className="action-panel reveal-on-scroll">
            <div className="section-content">
              <div className="action-heading">
                <div>
                  <p className="eyebrow">CONTRACT ACTIONS</p>
                  <h2>Manage account</h2>
                </div>
                <span className="action-chain">BSC</span>
              </div>
              <div className="action-tabs" role="tablist" aria-label="Contract action">
                {(['register', 'invest', 'withdraw', 'reinvest', 'upgrade'] as Action[]).map((tab) => (
                  <button
                    className={`action-tab ${action === tab ? 'selected' : ''} ${tab === 'upgrade' ? 'action-utility' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={action === tab}
                    key={tab}
                    onClick={() => selectedTab(tab)}
                  >
                    <span>{tab === 'upgrade' ? 'Plan' : tab}</span>
                  </button>
                ))}
              </div>
              <form className="action-form" onSubmit={(event) => void submitAction(event)}>
                {!['upgrade', 'reinvest'].includes(action) && <label className="field-label" htmlFor="token-address">Payment token</label>}
                {!['upgrade', 'reinvest'].includes(action) && <select id="token-address" value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)}>{PAYMENT_TOKENS.filter((token) => !(action === 'withdraw' && token.symbol === 'GC')).map((token) => <option value={token.address} key={token.address}>{token.symbol} · {token.name}</option>)}</select>}
                {!['upgrade', 'reinvest'].includes(action) && <div className={`token-validation ${tokenAllowed === true ? 'valid' : tokenAllowed === false ? 'invalid' : ''}`}>{tokenAllowed === true ? `${tokenSymbol} · ${tokenDecimals} decimals · allowed by contract` : tokenAllowed === false ? 'Token is not allowed by the contract' : 'Checking token with the contract…'}</div>}

                {action === 'register' && (
                  <>
                    <label className="field-label" htmlFor="referrer">Referrer address</label>
                    <div className="referrer-segment">
                      <button type="button" className={`referrer-btn ${referrerMode === 'manual' ? 'selected' : ''}`} onClick={() => { setReferrerMode('manual'); if (referrer === ZERO_REFERRER) setReferrer('') }}>Enter referrer</button>
                      <button type="button" className={`referrer-btn ${referrerMode === 'root' ? 'selected' : ''}`} onClick={() => { setReferrerMode('root'); setReferrer(ZERO_REFERRER) }}>No referrer</button>
                    </div>
                    <input id="referrer" value={referrer} onChange={(event) => setReferrer(event.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off" disabled={referrerMode === 'root'} />
                    <p className="form-hint">{referrerMode === 'root' ? 'Root registration: referrer will be set to 0x0000…0000 automatically.' : 'Must be an already-registered account address.'}</p>
                    <label className="field-label" htmlFor="registration-plan">Plan</label>
                    <select id="registration-plan" value={plan} onChange={(event) => setPlan(event.target.value)}>{eligiblePlans.map((planId) => <option value={planId} key={planId}>Plan {planNames[planId]}</option>)}</select>
                  </>
                )}

                {action === 'upgrade' && (
                  <>
                    <label className="field-label" htmlFor="upgrade-plan">Plan</label>
                    <select id="upgrade-plan" value={plan3xId} disabled>
                      <option value={plan3xId}>Plan 3x (auto-upgrade only)</option>
                    </select>
                    <p className="form-hint">
                      {is3x
                        ? 'You are already on 3x (reached by auto-upgrade). No manual upgrade is needed.'
                        : is2x
                          ? '2x is final and can never be upgraded.'
                          : is25x
                            ? upgradeReady
                              ? `You have ${directs} directs (need ${upgradeDirectsNeeded}). You can confirm the 2.5x → 3x upgrade.`
                              : `You need ${upgradeDirectsNeeded} directs for 3x. You have ${directs}.`
                            : `Only 2.5x users can upgrade to 3x, and only with ${upgradeDirectsNeeded} directs.`}
                    </p>
                  </>
                )}

                {['invest', 'withdraw', 'reinvest'].includes(action) && (
                  <>
                    <label className="field-label" htmlFor="amount">Amount</label>
                    <div className="amount-wrap"><input id="amount" type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><span>{action === 'reinvest' ? 'units' : tokenSymbol}</span></div>
                    {action === 'invest' && terms && <p className="form-hint">Range: {prettyAmount(terms.minInvest / tokenScale, tokenDecimals)} to {prettyAmount(terms.maxInvest / tokenScale, tokenDecimals)} {tokenSymbol}</p>}
                    {action === 'withdraw' && (
                      <>
                        <p className="form-hint">Available: {prettyAmount(summary?.withdrawable, unitDecimals)} contract units</p>
                        <div className={`withdraw-cooldown ${withdrawCooldownRemaining <= 0 ? 'ready' : 'on-cooldown'}`}>
                          <span className="withdraw-cooldown-label">{withdrawCooldownRemaining <= 0 ? '✓ Withdrawal available' : '⏳ Next withdrawal in'}</span>
                          {withdrawCooldownRemaining > 0 && <span className="withdraw-cooldown-timer">{formatCooldown(withdrawCooldownRemaining)}</span>}
                        </div>
                      </>
                    )}
                    {action === 'reinvest' && <p className="form-hint">Reinvest amount uses the contract's {unitDecimals}-decimal internal unit.</p>}
                  </>
                )}

                <div className="receipt-box">
                  <div className="receipt-row"><span className="label">Contract method</span><span className="value">{action === 'upgrade' ? 'upgradePlan' : action}</span></div>
                  {action === 'register' && (
                    <div className="receipt-row"><span className="label">Registration fee</span><span className="value">{prettyAmount(terms ? terms.registrationFee / tokenScale : undefined, tokenDecimals)} {tokenSymbol}</span></div>
                  )}
                </div>

                <button className={`submit-button action-button-${action}`} type="submit" disabled={submitDisabled}>
                  {busy ? <><span className="loader"></span> Processing</> : <>{action === 'withdraw' ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}{action === 'upgrade' ? 'Confirm plan change' : action === 'register' ? 'Register account' : `${action[0].toUpperCase()}${action.slice(1)}`}</>}
                </button>
                {!account && <p className="connect-hint">Connect a wallet to enable transactions.</p>}
                {terms?.paused && <p className="connect-hint">Contract is paused. New transactions are disabled.</p>}
              </form>
              <div className="action-disclaimer"><ShieldAlert size={14} /><span>Transactions are irreversible. Verify the token, amount, and contract address before approving.</span></div>
            </div>
          </aside>}
        </div>

        <footer className="page-footer reveal-on-scroll">
          <span><span className="footer-status" /> Reading from BNB Smart Chain</span>
          <span>Contract values are provided as-is; verify them on <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">BscScan <ExternalLink size={11} /></a></span>
        </footer>
      </main>

      {/* Mobile Sticky CTA Bar */}
      <div className="mobile-sticky-cta" aria-hidden="true">
        <button
          type="button"
          className={`submit-button action-button-${action}`}
          disabled={submitDisabled}
          onClick={() => {
            const form = document.querySelector('.action-form') as HTMLFormElement
            if (form) form.requestSubmit()
          }}
        >
          {busy ? <><span className="loader"></span> Processing</> : <>{action === 'withdraw' ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}{action === 'upgrade' ? 'Confirm plan change' : action === 'register' ? 'Register account' : `${action[0].toUpperCase()}${action.slice(1)}`}</>}
        </button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Contract actions">
        {(['register', 'invest', 'withdraw', 'reinvest', 'upgrade'] as Action[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`mobile-nav-btn ${action === tab ? 'selected' : ''} ${tab === 'upgrade' ? 'mobile-nav-utility' : ''}`}
            onClick={() => { selectedTab(tab); changeView('account') }}
            aria-label={tab === 'upgrade' ? 'Plan' : tab}
          >
            <span className="mobile-nav-icon">
              {tab === 'register' && <Wallet size={16} />}
              {tab === 'invest' && <ArrowDownLeft size={16} />}
              {tab === 'withdraw' && <ArrowUpRight size={16} />}
              {tab === 'reinvest' && <RefreshCw size={16} />}
              {tab === 'upgrade' && <Check size={16} />}
            </span>
            <span className="mobile-nav-label">{tab === 'upgrade' ? 'Plan' : tab}</span>
          </button>
        ))}
      </nav>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
            <div className="toast-icon">
              {toast.type === 'success' && <Check size={16} />}
              {toast.type === 'error' && <BadgeAlert size={16} />}
              {toast.type === 'info' && <CircleHelp size={16} />}
            </div>
            <span className="toast-message">{toast.message}</span>
            <button type="button" className="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="modal-overlay" onClick={cancelTransaction}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon">
                <ShieldAlert size={20} />
              </div>
              <div className="modal-title">
                <p className="eyebrow">CONFIRM TRANSACTION</p>
                <h3>{confirmModal.action === 'upgrade' ? 'Confirm plan change' : confirmModal.action === 'register' ? 'Register account' : confirmModal.action.charAt(0).toUpperCase() + confirmModal.action.slice(1)}</h3>
              </div>
              <button type="button" className="modal-close" onClick={cancelTransaction} aria-label="Close">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-details">{confirmModal.details}</p>
              {confirmModal.fee && (
                <div className="modal-fee">
                  <span className="modal-fee-label">Fee</span>
                  <span className="modal-fee-value">{confirmModal.fee}</span>
                </div>
              )}
              <div className="modal-warning">
                <ShieldAlert size={14} />
                <span>Transactions are irreversible. Verify the details before confirming.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="modal-cancel-btn" onClick={cancelTransaction}>Cancel</button>
              <button type="button" className="modal-confirm-btn" onClick={() => void executeConfirmedAction()} disabled={busy}>
                {busy ? <><span className="loader"></span> Processing</> : <><Check size={15} /> Confirm & Sign</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App