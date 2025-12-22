import { useState, useEffect } from 'react'
import { clsx } from 'clsx'

interface PaymentModalProps {
  total: number
  onComplete: () => void
  onCancel: () => void
}

type PaymentMethod = 'cash' | 'card' | 'split'

const tipOptions = [0, 5, 10, 15, 20] // Yüzde olarak

export function PaymentModal({ total, onComplete, onCancel }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashAmount, setCashAmount] = useState('')
  const [tipPercent, setTipPercent] = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [processing, setProcessing] = useState(false)

  // Split payment
  const [cardAmount, setCardAmount] = useState('')
  const [splitCashAmount, setSplitCashAmount] = useState('')

  const baseAmount = total / 100
  const tipAmount = customTip ? parseFloat(customTip) || 0 : (baseAmount * tipPercent) / 100
  const totalWithTip = baseAmount + tipAmount

  // Cash calculations
  const cashValue = parseFloat(cashAmount) || 0
  const change = cashValue - totalWithTip

  // Split calculations
  const cardValue = parseFloat(cardAmount) || 0
  const splitCashValue = parseFloat(splitCashAmount) || 0
  const splitTotal = cardValue + splitCashValue
  const splitRemaining = totalWithTip - splitTotal

  // Quick amounts based on total
  const quickAmounts = [
    Math.ceil(totalWithTip / 10) * 10,
    Math.ceil(totalWithTip / 50) * 50,
    Math.ceil(totalWithTip / 100) * 100,
    Math.ceil(totalWithTip / 100) * 100 + 100,
  ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4)

  const canPay = () => {
    if (method === 'cash') return cashValue >= totalWithTip
    if (method === 'card') return true
    if (method === 'split') return Math.abs(splitRemaining) < 0.01 && cardValue > 0
    return false
  }

  const handlePayment = async () => {
    if (!canPay()) return

    setProcessing(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setProcessing(false)
    onComplete()
  }

  // Auto-calculate split cash when card amount changes
  useEffect(() => {
    if (method === 'split' && cardValue > 0) {
      const remaining = totalWithTip - cardValue
      if (remaining > 0) {
        setSplitCashAmount(remaining.toFixed(2))
      }
    }
  }, [cardValue, totalWithTip, method])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-primary-600 text-white p-6 text-center">
          <p className="text-sm opacity-80">Odeme Tutari (KDV Dahil)</p>
          <p className="text-4xl font-bold">{baseAmount.toFixed(2)} ₺</p>
          {tipAmount > 0 && (
            <p className="text-sm mt-1 opacity-90">+ {tipAmount.toFixed(2)} ₺ bahsis = {totalWithTip.toFixed(2)} ₺</p>
          )}
        </div>

        {/* Tip Selection */}
        <div className="p-4 border-b bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">Bahsis</p>
          <div className="flex gap-2">
            {tipOptions.map((percent) => (
              <button
                key={percent}
                onClick={() => { setTipPercent(percent); setCustomTip('') }}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                  tipPercent === percent && !customTip
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border hover:border-primary-300'
                )}
              >
                {percent === 0 ? 'Yok' : `%${percent}`}
              </button>
            ))}
            <div className="relative flex-1">
              <input
                type="number"
                value={customTip}
                onChange={(e) => { setCustomTip(e.target.value); setTipPercent(0) }}
                placeholder="Ozel"
                className={clsx(
                  'w-full py-2 px-3 rounded-lg text-sm text-center border',
                  customTip ? 'border-primary-600 ring-1 ring-primary-600' : ''
                )}
              />
              {customTip && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₺</span>}
            </div>
          </div>
        </div>

        {/* Payment method tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setMethod('cash')}
            className={clsx(
              'flex-1 py-3 text-center font-medium transition-colors text-sm',
              method === 'cash'
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            💵 Nakit
          </button>
          <button
            onClick={() => setMethod('card')}
            className={clsx(
              'flex-1 py-3 text-center font-medium transition-colors text-sm',
              method === 'card'
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            💳 Kart
          </button>
          <button
            onClick={() => setMethod('split')}
            className={clsx(
              'flex-1 py-3 text-center font-medium transition-colors text-sm',
              method === 'split'
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            🔀 Parcali
          </button>
        </div>

        {/* Payment content */}
        <div className="p-6">
          {method === 'cash' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Alinan Tutar</label>
                <input
                  type="number"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="input text-2xl font-semibold text-center"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setCashAmount(amount.toString())}
                    className="btn btn-outline text-sm"
                  >
                    {amount} ₺
                  </button>
                ))}
              </div>

              {cashValue >= totalWithTip && (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg text-center">
                  <p className="text-sm">Para Ustu</p>
                  <p className="text-2xl font-bold">{change.toFixed(2)} ₺</p>
                </div>
              )}
            </div>
          )}

          {method === 'card' && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">💳</div>
              <p className="text-gray-600">Karti terminale yaklastirin veya takin</p>
              <p className="text-2xl font-bold text-primary-600 mt-4">{totalWithTip.toFixed(2)} ₺</p>
              <p className="text-sm text-gray-400 mt-2">Odeme bekleniyor...</p>
            </div>
          )}

          {method === 'split' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
                Toplam: <strong>{totalWithTip.toFixed(2)} ₺</strong> - Kart ve nakit kombinasyonu
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">💳 Kart ile</label>
                <input
                  type="number"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="0.00"
                  className="input text-xl font-semibold text-center"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">💵 Nakit ile</label>
                <input
                  type="number"
                  value={splitCashAmount}
                  onChange={(e) => setSplitCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="input text-xl font-semibold text-center"
                />
              </div>

              {splitRemaining > 0.01 && (
                <div className="bg-yellow-50 text-yellow-700 p-3 rounded-lg text-center text-sm">
                  Kalan: <strong>{splitRemaining.toFixed(2)} ₺</strong>
                </div>
              )}

              {Math.abs(splitRemaining) < 0.01 && cardValue > 0 && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-center text-sm">
                  ✓ Tutarlar esit
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-3">
          <button
            onClick={onCancel}
            disabled={processing}
            className="btn btn-outline flex-1"
          >
            Iptal
          </button>
          <button
            onClick={handlePayment}
            disabled={processing || !canPay()}
            className="btn btn-primary flex-1"
          >
            {processing ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Isleniyor...
              </span>
            ) : (
              <>Ode ({totalWithTip.toFixed(2)} ₺)</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
