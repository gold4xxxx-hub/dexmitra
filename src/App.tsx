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
  RefreshCw,
  ShieldAlert,
  Wallet,
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
  const [timelineTab, setTimelineTab] = useState<'positions' | 'events'>('positions')
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
  }, [account, refreshVersion])

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
    }, 500)
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
      setError(readableError(connectError))
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
      const client = await walletClient()
      const token = isAddress(tokenAddress) ? getAddress(tokenAddress) : null
      let hash: `0x${string}`

      if (action === 'register') {
        if (!token || !isAddress(referrer)) throw new Error('Enter a valid payment token and referrer address.')
        const referrerAddress = getAddress(referrer)
        if (referrerAddress !== '0x0000000000000000000000000000000000000000') {
          const referrerSummary = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'getUserSummary', args: [referrerAddress] }) as unknown as UserSummary
          if (!referrerSummary.registered) throw new Error('Referrer is not registered. Use 0x0...0 for the first/root registration, or an already-registered account.')
        }
        await approveToken(terms.registrationFee / tokenScale)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'register', args: [getAddress(referrer), Number(plan), token] })
      } else if (action === 'invest') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        const value = parseUnits(amount, tokenDecimals)
        const minInvest = terms.minInvest / tokenScale
        const maxInvest = terms.maxInvest / tokenScale
        if (value < minInvest || value > maxInvest) throw new Error(`Amount must be between ${prettyAmount(minInvest, tokenDecimals)} and ${prettyAmount(maxInvest, tokenDecimals)} ${tokenSymbol}.`)
        await approveToken(value)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'invest', args: [parseUnits(amount, 18), token] })
      } else if (action === 'withdraw') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'withdraw', args: [token, parseUnits(amount, tokenDecimals)] })
      } else if (action === 'reinvest') {
        if (!amount) throw new Error('Enter an amount to reinvest.')
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'reinvest', args: [parseUnits(amount, 18)] })
      } else {
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'upgradePlan', args: [Number(plan)] })
      }

      setTxHash(hash)
      setNotice('Transaction submitted. Waiting for BNB Smart Chain confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      setNotice('Transaction confirmed.')
      setAmount('')
      // Log transaction to history
      const record: TxRecord = {
        type: action,
        hash,
        amount: amount || (action === 'register' ? terms?.registrationFee?.toString() ?? '' : ''),
        token: action === 'reinvest' ? 'units' : tokenSymbol,
        timestamp: Date.now(),
      }
      setTxHistory((prev) => [record, ...prev].slice(0, 50))
      setRefreshVersion((version) => version + 1)
    } catch (actionError) {
      setError(readableError(actionError))
    } finally {
      setBusy(false)
    }
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

      <main id="top" className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ACCOUNT CONSOLE <span>·</span> BSC MAINNET</p>
            <h1>Dashboard</h1>
            <p className="subheading">A direct view of your account and the contract state.</p>
          </div>
          <button className="icon-button refresh-button" type="button" onClick={() => setRefreshVersion((version) => version + 1)} aria-label="Refresh contract data" title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>

        <section className="contract-strip reveal-on-scroll" aria-label="Contract address">
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

        {error && <div className="feedback error-feedback" role="alert"><BadgeAlert size={16} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><span aria-hidden="true">×</span></button></div>}
        {notice && <div className="feedback success-feedback" role="status"><Check size={16} /><span>{notice} {txHash && <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}</span></div>}

        <section className="metrics" aria-label="Account summary">
          <article className="metric metric-primary reveal-on-scroll">
            <div className="metric-label">TOTAL INVESTED <span title="Value reported by the contract."><CircleHelp size={12} aria-label="Value reported by the contract" /></span></div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.totalInvested ?? 0n} decimals={unitDecimals} />}<small>units</small></div>
            <div className="metric-foot">Lifetime deposits</div>
          </article>
          <article className="metric reveal-on-scroll">
            <div className="metric-label">ACTIVE PRINCIPAL</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.activeInvested ?? 0n} decimals={unitDecimals} />}<small>units</small></div>
            <div className="metric-foot">Currently active</div>
          </article>
          <article className="metric metric-earn reveal-on-scroll">
            <div className="metric-label">WITHDRAWABLE</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.withdrawable ?? 0n} decimals={unitDecimals} />}<small>units</small></div>
            <div className="metric-foot">Contract-reported balance</div>
          </article>
          <article className="metric metric-earn reveal-on-scroll">
            <div className="metric-label">PENDING ROI</div>
            <div className="metric-value">{loading ? <Skeleton width={60} /> : <Counter target={summary?.pendingRoi ?? 0n} decimals={unitDecimals} />}<small>units</small></div>
            <div className="metric-foot">Not a guaranteed return</div>
          </article>
        </section>

        <div className="workspace-grid">
          <div className="left-column">
            <section className="data-section positions-section reveal-on-scroll">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PORTFOLIO</p>
                  <h2>Investment positions</h2>
                </div>
                <span className="count-pill">{investments.filter((item) => item.active).length} active</span>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view positions</strong><span>Your account data is read directly from the contract.</span></div>
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={18} /><span>Loading on-chain positions…</span></div>
              ) : investments.length === 0 ? (
                <div className="empty-state"><ArrowDownLeft size={18} /><strong>No positions found</strong><span>This wallet has no investment records in the contract.</span></div>
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
            </section>

            <section className="data-section terms-section reveal-on-scroll">
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
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view analytics</strong><span>Earnings data is read directly from the contract.</span></div>
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

            <section className="data-section levels-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DOWNLINE NETWORK</p>
                  <h2>Level business</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view level data</strong><span>Level business and income data is read directly from the contract.</span></div>
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

            <section className="data-section timeline-section">
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
                  <div className="empty-state"><ArrowDownLeft size={18} /><strong>No positions found</strong><span>Investments will appear here once made.</span></div>
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

            <section className="data-section tx-history-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TRANSACTION HISTORY</p>
                  <h2>Recent activity</h2>
                </div>
                {txHistory.length > 0 && <span className="count-pill">{txHistory.length} txs</span>}
              </div>
              {txHistory.length === 0 ? (
                <div className="empty-state"><RefreshCw size={18} /><strong>No transactions yet</strong><span>Your completed transactions will appear here.</span></div>
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

            <section className="data-section referral-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">REFERRAL NETWORK</p>
                  <h2>Invite & earn</h2>
                </div>
                <span className="live-read"><span /> Live</span>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={18} /><strong>Connect a wallet to view referral data</strong><span>Your referral link and stats will appear here.</span></div>
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

          </div>

          <aside className="action-panel reveal-on-scroll">
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
                {!['upgrade', 'reinvest'].includes(action) && <select id="token-address" value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)}>{PAYMENT_TOKENS.map((token) => <option value={token.address} key={token.address}>{token.symbol} · {token.name}</option>)}</select>}
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
          </aside>
        </div>

        <footer className="page-footer reveal-on-scroll">
          <span><span className="footer-status" /> Reading from BNB Smart Chain</span>
          <span>Contract values are provided as-is; verify them on <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">BscScan <ExternalLink size={11} /></a></span>
        </footer>
      </main>
    </div>
  )
}

export default App