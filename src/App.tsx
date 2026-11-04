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

function readableError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message
    if (message.includes('User rejected')) return 'Transaction was rejected in your wallet.'
    return message.split('\n')[0].slice(0, 180)
  }
  return 'The request could not be completed.'
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
  const [action, setAction] = useState<Action>('register')
  const [amount, setAmount] = useState('')
  const [referrer, setReferrer] = useState('')
  const [plan, setPlan] = useState('0')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  useEffect(() => {
    localStorage.setItem('dexmitra-token', tokenAddress)
  }, [tokenAddress])

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
    const provider = window.ethereum
    if (!provider?.on) return
    const handleAccounts = (...accounts: unknown[]) => {
      const next = accounts[0] as string[] | undefined
      setAccount(next?.[0] && isAddress(next[0]) ? getAddress(next[0]) : null)
    }
    provider.on('accountsChanged', handleAccounts)
    return () => provider.removeListener?.('accountsChanged', handleAccounts)
  }, [])

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
        await approveToken(terms.registrationFee / tokenScale)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'register', args: [getAddress(referrer), Number(plan), token] })
      } else if (action === 'invest') {
        if (!token || !amount) throw new Error('Enter an amount and a valid payment token.')
        const value = parseUnits(amount, tokenDecimals)
        const minInvest = terms.minInvest / tokenScale
        const maxInvest = terms.maxInvest / tokenScale
        if (value < minInvest || value > maxInvest) throw new Error(`Amount must be between ${prettyAmount(minInvest, tokenDecimals)} and ${prettyAmount(maxInvest, tokenDecimals)} ${tokenSymbol}.`)
        await approveToken(value)
        hash = await client.writeContract({ address: CONTRACT_ADDRESS, abi: contractAbi, functionName: 'invest', args: [value, token] })
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
      setRefreshVersion((version) => version + 1)
    } catch (actionError) {
      setError(readableError(actionError))
    } finally {
      setBusy(false)
    }
  }

  const planNames = ['2x', '3x', '2.5x']
  const unitDecimals = terms?.unit.toString().length ? terms.unit.toString().length - 1 : 18
  const tokenScale = 10n ** BigInt(Math.max(0, 18 - tokenDecimals))
  const selectedTab = (next: Action) => {
    setAction(next)
    setNotice('')
    setError('')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Dexmitra dashboard">
          <span className="brand-mark"><Landmark size={18} strokeWidth={2.2} /></span>
          <span>dexmitra<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <a className="network-pill" href="https://bscscan.com" target="_blank" rel="noreferrer">
            <span className="network-dot" /> BNB Chain <ExternalLink size={13} />
          </a>
          {account ? (
            <button className="wallet-button connected" type="button" onClick={() => setAccount(null)} title="Disconnect wallet">
              <span className="wallet-dot" />{shortAddress(account)}<ChevronDown size={14} />
            </button>
          ) : (
            <button className="wallet-button" type="button" onClick={() => void connectWallet()}><Wallet size={16} /> Connect wallet</button>
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
            <RefreshCw size={17} />
          </button>
        </div>

        <section className="contract-strip" aria-label="Contract address">
          <span className="contract-label">CONTRACT</span>
          <code>{CONTRACT_ADDRESS}</code>
          <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" aria-label="Open contract on BscScan"><ExternalLink size={15} /></a>
          <span className={`status-chip ${terms?.paused ? 'is-paused' : 'is-live'}`}><span />{terms?.paused ? 'Paused' : 'Contract active'}</span>
        </section>

        {error && <div className="feedback error-feedback" role="alert"><BadgeAlert size={17} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><span aria-hidden="true">×</span></button></div>}
        {notice && <div className="feedback success-feedback" role="status"><Check size={17} /><span>{notice} {txHash && <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}</span></div>}

        <section className="metrics" aria-label="Account summary">
          <article className="metric metric-primary">
            <div className="metric-label">TOTAL INVESTED <span title="Value reported by the contract."><CircleHelp size={13} aria-label="Value reported by the contract" /></span></div>
            <div className="metric-value">{loading ? '...' : prettyAmount(summary?.totalInvested, unitDecimals)} <small>units</small></div>
            <div className="metric-foot">Lifetime deposits</div>
          </article>
          <article className="metric">
            <div className="metric-label">ACTIVE PRINCIPAL</div>
            <div className="metric-value">{loading ? '...' : prettyAmount(summary?.activeInvested, unitDecimals)} <small>units</small></div>
            <div className="metric-foot">Currently active</div>
          </article>
          <article className="metric">
            <div className="metric-label">WITHDRAWABLE</div>
            <div className="metric-value">{loading ? '...' : prettyAmount(summary?.withdrawable, unitDecimals)} <small>units</small></div>
            <div className="metric-foot">Contract-reported balance</div>
          </article>
          <article className="metric">
            <div className="metric-label">PENDING ROI</div>
            <div className="metric-value">{loading ? '...' : prettyAmount(summary?.pendingRoi, unitDecimals)} <small>units</small></div>
            <div className="metric-foot">Not a guaranteed return</div>
          </article>
        </section>

        <div className="workspace-grid">
          <div className="left-column">
            <section className="data-section positions-section">
              <div className="section-heading">
                <div><p className="eyebrow">PORTFOLIO</p><h2>Investment positions</h2></div>
                <span className="count-pill">{investments.filter((item) => item.active).length} active</span>
              </div>
              {!account ? (
                <div className="empty-state"><Wallet size={20} /><strong>Connect a wallet to view positions</strong><span>Your account data is read directly from the contract.</span></div>
              ) : loading ? (
                <div className="empty-state"><LoaderCircle className="spin" size={20} /><span>Loading on-chain positions...</span></div>
              ) : investments.length === 0 ? (
                <div className="empty-state"><ArrowDownLeft size={20} /><strong>No positions found</strong><span>This wallet has no investment records in the contract.</span></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Position</th><th>Principal</th><th>Earned</th><th>Cap</th><th>Status</th></tr></thead>
                    <tbody>{investments.map((item, index) => (
                      <tr key={`${item.startedAt}-${index}`}>
                        <td data-label="Position"><span className="position-name">#{investments.length - index}</span><span className="position-date">{new Date(Number(item.startedAt) * 1000).toLocaleDateString()}</span></td>
                        <td data-label="Principal">{prettyAmount(item.amount, unitDecimals)} <small>units</small></td>
                        <td data-label="Earned">{prettyAmount(item.earned + item.otherEarned, unitDecimals)} <small>units</small></td>
                        <td data-label="Cap">{prettyAmount(item.cap, unitDecimals)} <small>units</small></td>
                        <td data-label="Status"><span className={`row-status ${item.active ? 'active' : ''}`}><span />{item.active ? 'Active' : 'Closed'}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="data-section terms-section">
              <div className="section-heading">
                <div><p className="eyebrow">READ FROM CONTRACT</p><h2>Plan parameters</h2></div>
                <span className="live-read"><span /> Live</span>
              </div>
              <div className="terms-table">
                <div className="terms-row terms-head"><span>Plan</span><span>Multiplier</span><span>Monthly rate</span><span>Directs required</span></div>
                {terms?.plans.map((planId, index) => (
                  <div className="terms-row" key={planId}>
                    <span className="term-plan"><span className={`plan-number plan-${index}`}>0{index + 1}</span>Plan {planNames[index]}</span>
                    <span>{(Number(terms.multiplierBps[planId]) / 10000).toFixed(2)}x</span>
                    <span>{(Number(terms.roiBps[planId]) / 100).toFixed(2)}%</span>
                    <span>{String(terms.minDirects[planId])}</span>
                  </div>
                ))}
                {!terms && <div className="terms-unavailable">Plan data unavailable.</div>}
              </div>
              <p className="terms-note"><CircleHelp size={14} /> Rates and caps are contract parameters, not promises of payment.</p>
            </section>
          </div>

          <aside className="action-panel">
            <div className="action-heading"><div><p className="eyebrow">CONTRACT ACTIONS</p><h2>Manage account</h2></div><span className="action-chain">BSC</span></div>
            <div className="action-tabs" role="tablist" aria-label="Contract action">
              {(['register', 'invest', 'withdraw', 'reinvest', 'upgrade'] as Action[]).map((tab, index) => (
                <button className={`action-tab action-tab-${tab} ${action === tab ? 'selected' : ''} ${tab === 'upgrade' ? 'action-utility' : ''}`} type="button" role="tab" aria-selected={action === tab} key={tab} onClick={() => selectedTab(tab)}>
                  {tab !== 'upgrade' && <span className="action-step">0{index + 1}</span>}
                  <span>{tab === 'upgrade' ? 'Plan' : tab}</span>
                </button>
              ))}
            </div>
            <form className="action-form" onSubmit={(event) => void submitAction(event)}>
              {!['upgrade', 'reinvest'].includes(action) && <label className="field-label" htmlFor="token-address">Payment token</label>}
              {!['upgrade', 'reinvest'].includes(action) && <select id="token-address" value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)}>{PAYMENT_TOKENS.map((token) => <option value={token.address} key={token.address}>{token.symbol} · {token.name}</option>)}</select>}
              {!['upgrade', 'reinvest'].includes(action) && <div className={`token-validation ${tokenAllowed === true ? 'valid' : tokenAllowed === false ? 'invalid' : ''}`}>{tokenAllowed === true ? `${tokenSymbol} · ${tokenDecimals} decimals · allowed by contract` : tokenAllowed === false ? 'Token is not allowed by the contract' : 'Checking token with the contract...'}</div>}

              {action === 'register' && <>
                <label className="field-label" htmlFor="referrer">Referrer address</label>
                <input id="referrer" value={referrer} onChange={(event) => setReferrer(event.target.value.trim())} placeholder="0x..." spellCheck={false} autoComplete="off" />
                <label className="field-label" htmlFor="registration-plan">Plan</label>
                <select id="registration-plan" value={plan} onChange={(event) => setPlan(event.target.value)}>{(terms?.plans ?? [0, 1, 2]).map((planId, index) => <option value={planId} key={planId}>Plan {planNames[index]}</option>)}</select>
                <div className="read-only-value"><span>Registration fee</span><strong>{prettyAmount(terms ? terms.registrationFee / tokenScale : undefined, tokenDecimals)} {tokenSymbol}</strong></div>
              </>}

              {action === 'upgrade' && <>
                <label className="field-label" htmlFor="upgrade-plan">New plan</label>
                <select id="upgrade-plan" value={plan} onChange={(event) => setPlan(event.target.value)}>{(terms?.plans ?? [0, 1, 2]).map((planId, index) => <option value={planId} key={planId}>Plan {planNames[index]}</option>)}</select>
                <p className="form-hint">Plan upgrades are irreversible if enforced by the contract. Confirm the selected plan in your wallet.</p>
              </>}

              {['invest', 'withdraw', 'reinvest'].includes(action) && <>
                <label className="field-label" htmlFor="amount">Amount</label>
                <div className="amount-wrap"><input id="amount" type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><span>{action === 'reinvest' ? 'units' : tokenSymbol}</span></div>
                {action === 'invest' && terms && <p className="form-hint">Range: {prettyAmount(terms.minInvest / tokenScale, tokenDecimals)} to {prettyAmount(terms.maxInvest / tokenScale, tokenDecimals)} {tokenSymbol}</p>}
                {action === 'withdraw' && <p className="form-hint">Available: {prettyAmount(summary?.withdrawable, unitDecimals)} contract units</p>}
                {action === 'reinvest' && <p className="form-hint">Reinvest amount uses the contract's {unitDecimals}-decimal internal unit.</p>}
              </>}

              <div className="form-summary"><span>{action === 'invest' ? 'Method' : action === 'register' ? 'Method' : action === 'upgrade' ? 'Method' : 'Contract method'}</span><strong>{action === 'upgrade' ? 'upgradePlan' : action}</strong></div>
              <button className={`submit-button action-button-${action}`} type="submit" disabled={busy || !account || loading || Boolean(terms?.paused) || (action === 'register' && Boolean(summary?.registered))}>
                {busy ? <><LoaderCircle className="spin" size={16} /> Processing</> : <>{action === 'withdraw' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}{action === 'upgrade' ? 'Confirm plan change' : action === 'register' ? 'Register account' : `${action[0].toUpperCase()}${action.slice(1)}`}</>}
              </button>
              {!account && <p className="connect-hint">Connect a wallet to enable transactions.</p>}
              {terms?.paused && <p className="connect-hint">Contract is paused. New transactions are disabled.</p>}
            </form>
            <div className="action-disclaimer"><ShieldAlert size={15} /><span>Transactions are irreversible. Verify the token, amount, and contract address before approving.</span></div>
          </aside>
        </div>

        <footer className="page-footer">
          <span><span className="footer-status" /> Reading from BNB Smart Chain</span>
          <span>Contract values are provided as-is; verify them on <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">BscScan <ExternalLink size={12} /></a></span>
        </footer>
      </main>
    </div>
  )
}

export default App
