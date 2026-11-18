import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Loader } from 'lucide-react'
import type { Address } from 'viem'
import {
  getCoinPrices,
  getUserCoinBalance,
  getCoinTransactionHistory,
  buyCoin,
  sellCoin,
  type CoinType,
  type CoinPrice,
  type UserCoinBalance,
  type CoinTransaction,
} from './coinTradingApi'

interface CoinTradingPanelProps {
  walletAddress: Address | null
  onError: (error: string) => void
  onSuccess: (message: string) => void
}

export function CoinTradingPanel({
  walletAddress,
  onError,
  onSuccess,
}: CoinTradingPanelProps) {
  const [prices, setPrices] = useState<CoinPrice[]>([])
  const [balance, setBalance] = useState<UserCoinBalance | null>(null)
  const [transactions, setTransactions] = useState<CoinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'history'>('buy')

  const [buyForm, setBuyForm] = useState({
    coinType: 'Gold coin' as CoinType,
    quantity: '',
    weightGrams: '',
    pricePerGram: '',
    totalPrice: '',
    notes: '',
  })

  const [sellForm, setSellForm] = useState({
    coinType: 'Gold coin' as CoinType,
    quantity: '',
    weightGrams: '',
    notes: '',
  })

  // Load data
  useEffect(() => {
    if (!walletAddress) return

    const loadData = async () => {
      try {
        setLoading(true)
        const [priceData, balanceData, historyData] = await Promise.all([
          getCoinPrices(),
          getUserCoinBalance(walletAddress),
          getCoinTransactionHistory(walletAddress),
        ])
        setPrices(priceData)
        setBalance(balanceData)
        setTransactions(historyData)
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Failed to load coin data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [walletAddress, onError])

  const handleBuySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletAddress) return

    try {
      setSubmitting(true)

      if (!buyForm.quantity || !buyForm.weightGrams || !buyForm.pricePerGram || !buyForm.totalPrice) {
        throw new Error('Fill all required fields')
      }

      await buyCoin({
        walletAddress,
        coinType: buyForm.coinType,
        quantity: parseInt(buyForm.quantity),
        weightGrams: buyForm.weightGrams,
        pricePerGram: buyForm.pricePerGram,
        totalPrice: buyForm.totalPrice,
        notes: buyForm.notes,
      })

      onSuccess(`Bought ${buyForm.quantity} ${buyForm.coinType} for ${buyForm.totalPrice}`)

      // Reset form and reload
      setBuyForm({
        coinType: 'Gold coin',
        quantity: '',
        weightGrams: '',
        pricePerGram: '',
        totalPrice: '',
        notes: '',
      })

      // Reload balance and transactions
      if (walletAddress) {
        const [balanceData, historyData] = await Promise.all([
          getUserCoinBalance(walletAddress),
          getCoinTransactionHistory(walletAddress),
        ])
        setBalance(balanceData)
        setTransactions(historyData)
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to process buy')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletAddress) return

    try {
      setSubmitting(true)

      if (!sellForm.quantity || !sellForm.weightGrams) {
        throw new Error('Fill all required fields')
      }

      const selectedPrice = prices.find((p) => p.coin_type === sellForm.coinType)
      if (!selectedPrice) throw new Error('Coin price not found')

      const totalPrice = (Number(sellForm.weightGrams) * Number(selectedPrice.price_per_gram)).toFixed(6)

      await sellCoin({
        walletAddress,
        coinType: sellForm.coinType,
        quantity: parseInt(sellForm.quantity),
        weightGrams: sellForm.weightGrams,
        pricePerGram: selectedPrice.price_per_gram,
        totalPrice,
        notes: sellForm.notes,
      })

      onSuccess(`Sold ${sellForm.quantity} ${sellForm.coinType} for ${totalPrice}`)

      // Reset form and reload
      setSellForm({
        coinType: 'Gold coin',
        quantity: '',
        weightGrams: '',
        notes: '',
      })

      // Reload balance and transactions
      if (walletAddress) {
        const [balanceData, historyData] = await Promise.all([
          getUserCoinBalance(walletAddress),
          getCoinTransactionHistory(walletAddress),
        ])
        setBalance(balanceData)
        setTransactions(historyData)
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to process sell')
    } finally {
      setSubmitting(false)
    }
  }

  const updateBuyTotalPrice = () => {
    const weight = parseFloat(buyForm.weightGrams) || 0
    const price = parseFloat(buyForm.pricePerGram) || 0
    const totalPrice = (weight * price).toFixed(6)
    setBuyForm((prev) => ({ ...prev, totalPrice }))
  }

  if (!walletAddress) {
    return (
      <div className="coin-trading-panel">
        <p className="coin-trading-empty">Connect your wallet to trade coins</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="coin-trading-panel">
        <div className="coin-trading-loading">
          <Loader className="spinner" />
          Loading coin data…
        </div>
      </div>
    )
  }

  const goldPrice = prices.find((p) => p.coin_type === 'Gold coin')
  const silverPrice = prices.find((p) => p.coin_type === 'Silver coin')

  return (
    <section className="coin-trading-panel" aria-label="Coin trading">
      {/* Current Balance */}
      <div className="coin-balance-summary">
        <div className="coin-balance-card">
          <h3>Gold Coins</h3>
          <div className="balance-amount">{balance?.gold_quantity || 0}</div>
          <div className="balance-weight">{balance?.gold_weight_grams || '0'} g</div>
          {goldPrice && <div className="balance-price">₹{goldPrice.price_per_gram}/g</div>}
        </div>

        <div className="coin-balance-card">
          <h3>Silver Coins</h3>
          <div className="balance-amount">{balance?.silver_quantity || 0}</div>
          <div className="balance-weight">{balance?.silver_weight_grams || '0'} g</div>
          {silverPrice && <div className="balance-price">₹{silverPrice.price_per_gram}/g</div>}
        </div>
      </div>

      {/* Tabs */}
      <div className="coin-trading-tabs">
        <button
          className={`tab ${activeTab === 'buy' ? 'active' : ''}`}
          onClick={() => setActiveTab('buy')}
        >
          <ArrowDownLeft size={16} /> Buy
        </button>
        <button
          className={`tab ${activeTab === 'sell' ? 'active' : ''}`}
          onClick={() => setActiveTab('sell')}
        >
          <ArrowUpRight size={16} /> Sell
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {/* Buy Form */}
      {activeTab === 'buy' && (
        <form onSubmit={handleBuySubmit} className="coin-form">
          <label className="form-field">
            <span>Coin Type</span>
            <select
              value={buyForm.coinType}
              onChange={(e) => setBuyForm((prev) => ({ ...prev, coinType: e.target.value as CoinType }))}
              required
            >
              <option value="Gold coin">Gold coin</option>
              <option value="Silver coin">Silver coin</option>
            </select>
          </label>

          <label className="form-field">
            <span>Quantity</span>
            <input
              type="number"
              value={buyForm.quantity}
              onChange={(e) => setBuyForm((prev) => ({ ...prev, quantity: e.target.value }))}
              min="1"
              required
            />
          </label>

          <label className="form-field">
            <span>Weight (grams)</span>
            <input
              type="number"
              value={buyForm.weightGrams}
              onChange={(e) => {
                setBuyForm((prev) => ({ ...prev, weightGrams: e.target.value }))
              }}
              onBlur={updateBuyTotalPrice}
              step="0.001"
              min="0"
              required
            />
          </label>

          <label className="form-field">
            <span>Price per gram (₹)</span>
            <input
              type="number"
              value={buyForm.pricePerGram}
              onChange={(e) => {
                setBuyForm((prev) => ({ ...prev, pricePerGram: e.target.value }))
              }}
              onBlur={updateBuyTotalPrice}
              step="0.000001"
              min="0"
              required
            />
          </label>

          <label className="form-field">
            <span>Total Price (₹)</span>
            <input
              type="number"
              value={buyForm.totalPrice}
              onChange={(e) => setBuyForm((prev) => ({ ...prev, totalPrice: e.target.value }))}
              step="0.000001"
              readOnly
            />
          </label>

          <label className="form-field">
            <span>Notes (optional)</span>
            <textarea
              value={buyForm.notes}
              onChange={(e) => setBuyForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? <Loader size={16} className="spinner" /> : <TrendingDown size={16} />}
            {submitting ? 'Processing…' : 'Buy Coins'}
          </button>
        </form>
      )}

      {/* Sell Form */}
      {activeTab === 'sell' && (
        <form onSubmit={handleSellSubmit} className="coin-form">
          <label className="form-field">
            <span>Coin Type</span>
            <select
              value={sellForm.coinType}
              onChange={(e) => setSellForm((prev) => ({ ...prev, coinType: e.target.value as CoinType }))}
              required
            >
              <option value="Gold coin">Gold coin</option>
              <option value="Silver coin">Silver coin</option>
            </select>
          </label>

          <label className="form-field">
            <span>Quantity Available: {balance?.gold_quantity || 0}</span>
            <input
              type="number"
              value={sellForm.quantity}
              onChange={(e) => setSellForm((prev) => ({ ...prev, quantity: e.target.value }))}
              min="1"
              max={sellForm.coinType === 'Gold coin' ? String(balance?.gold_quantity || 0) : String(balance?.silver_quantity || 0)}
              required
            />
          </label>

          <label className="form-field">
            <span>Weight (grams)</span>
            <input
              type="number"
              value={sellForm.weightGrams}
              onChange={(e) => setSellForm((prev) => ({ ...prev, weightGrams: e.target.value }))}
              step="0.001"
              min="0"
              required
            />
          </label>

          <label className="form-field">
            <span>Notes (optional)</span>
            <textarea
              value={sellForm.notes}
              onChange={(e) => setSellForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? <Loader size={16} className="spinner" /> : <TrendingUp size={16} />}
            {submitting ? 'Processing…' : 'Sell Coins'}
          </button>
        </form>
      )}

      {/* Transaction History */}
      {activeTab === 'history' && (
        <div className="coin-history">
          {transactions.length === 0 ? (
            <p className="coin-history-empty">No transaction history</p>
          ) : (
            <div className="coin-transactions">
              {transactions.map((tx) => (
                <div key={tx.id} className="coin-transaction-item">
                  <div className="tx-header">
                    <div className="tx-type">
                      {tx.transaction_type === 'buy' ? (
                        <ArrowDownLeft size={16} className="buy-icon" />
                      ) : (
                        <ArrowUpRight size={16} className="sell-icon" />
                      )}
                      <span>
                        {tx.transaction_type === 'buy' ? 'Bought' : 'Sold'} {tx.quantity} {tx.coin_type}
                      </span>
                    </div>
                    <div className="tx-price">₹{tx.total_price}</div>
                  </div>
                  <div className="tx-details">
                    <span>{tx.weight_grams}g @ ₹{tx.price_per_gram}/g</span>
                    <span className="tx-date">{new Date(tx.created_at).toLocaleDateString()}</span>
                  </div>
                  {tx.notes && <div className="tx-notes">{tx.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
