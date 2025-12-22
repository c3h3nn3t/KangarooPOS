import { useState } from 'react'
import { clsx } from 'clsx'

type SettingsTab = 'store' | 'employees' | 'products' | 'payments' | 'receipts' | 'devices'

interface Employee {
  id: string
  name: string
  role: 'manager' | 'cashier'
  pin: string
  active: boolean
}

interface Device {
  id: string
  name: string
  type: 'pos' | 'kds' | 'printer'
  status: 'online' | 'offline'
  lastSeen: Date
}

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'store', label: 'Magaza', icon: '🏪' },
  { id: 'employees', label: 'Calisanlar', icon: '👥' },
  { id: 'products', label: 'Urunler', icon: '📦' },
  { id: 'payments', label: 'Odeme', icon: '💳' },
  { id: 'receipts', label: 'Fis', icon: '🧾' },
  { id: 'devices', label: 'Cihazlar', icon: '📱' },
]

// Mock data
const employees: Employee[] = [
  { id: '1', name: 'Ahmet Yilmaz', role: 'manager', pin: '****', active: true },
  { id: '2', name: 'Ayse Demir', role: 'cashier', pin: '****', active: true },
  { id: '3', name: 'Mehmet Kaya', role: 'cashier', pin: '****', active: false },
]

const devices: Device[] = [
  { id: '1', name: 'Kasa 1', type: 'pos', status: 'online', lastSeen: new Date() },
  { id: '2', name: 'Mutfak Ekrani', type: 'kds', status: 'online', lastSeen: new Date() },
  { id: '3', name: 'Yazici 1', type: 'printer', status: 'offline', lastSeen: new Date(Date.now() - 1000 * 60 * 30) },
]

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('store')

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r p-4">
        <h2 className="text-lg font-semibold mb-4">Ayarlar</h2>
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                activeTab === tab.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'store' && <StoreSettings />}
        {activeTab === 'employees' && <EmployeeSettings employees={employees} />}
        {activeTab === 'products' && <ProductSettings />}
        {activeTab === 'payments' && <PaymentSettings />}
        {activeTab === 'receipts' && <ReceiptSettings />}
        {activeTab === 'devices' && <DeviceSettings devices={devices} />}
      </div>
    </div>
  )
}

function StoreSettings() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Magaza Ayarlari</h2>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Magaza Adi
          </label>
          <input
            type="text"
            defaultValue="Kahve Dukkani - Kadikoy"
            className="input w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Telefon
            </label>
            <input
              type="tel"
              defaultValue="+90 216 555 1234"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-posta
            </label>
            <input
              type="email"
              defaultValue="kadikoy@kahvedukkani.com"
              className="input w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adres
          </label>
          <textarea
            defaultValue="Caferaga Mah. Moda Cad. No:123, Kadikoy, Istanbul"
            rows={2}
            className="input w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Para Birimi
            </label>
            <select className="input w-full">
              <option value="TRY">Turk Lirasi (TL)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dolar (USD)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dil
            </label>
            <select className="input w-full">
              <option value="tr">Turkce</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vergi No
            </label>
            <input
              type="text"
              defaultValue="1234567890"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              KDV Orani
            </label>
            <select className="input w-full">
              <option value="20">%20 (Standart)</option>
              <option value="10">%10 (Indirimli)</option>
              <option value="1">%1 (Ozel)</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t">
          <button className="btn btn-primary">Kaydet</button>
        </div>
      </div>
    </div>
  )
}

function EmployeeSettings({ employees }: { employees: Employee[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Calisanlar</h2>
        <button className="btn btn-primary">+ Calisan Ekle</button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Isim</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Rol</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">PIN</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Durum</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Islemler</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t">
                <td className="px-4 py-3 font-medium">{emp.name}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    emp.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                  )}>
                    {emp.role === 'manager' ? 'Yonetici' : 'Kasiyer'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{emp.pin}</td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    emp.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  )}>
                    {emp.active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-primary-600 hover:text-primary-700 text-sm font-medium mr-3">
                    Duzenle
                  </button>
                  <button className="text-red-600 hover:text-red-700 text-sm font-medium">
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductSettings() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Urun Yonetimi</h2>
        <div className="flex gap-2">
          <button className="btn btn-outline">Kategori Ekle</button>
          <button className="btn btn-primary">+ Urun Ekle</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <p className="text-gray-500 text-center py-8">
          Urun yonetimi sayfasi yapim asamasinda...
          <br />
          <span className="text-sm">Kategoriler, urunler ve fiyatlandirma buradan yonetilecek.</span>
        </p>
      </div>
    </div>
  )
}

function PaymentSettings() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Odeme Ayarlari</h2>

      <div className="space-y-4">
        {/* Cash */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💵</span>
              <div>
                <h3 className="font-medium">Nakit</h3>
                <p className="text-sm text-gray-500">Nakit odeme kabul et</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💳</span>
              <div>
                <h3 className="font-medium">Kredi/Banka Karti</h3>
                <p className="text-sm text-gray-500">iyzico ile entegre</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>

        {/* EFT-POS */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🖥️</span>
              <div>
                <h3 className="font-medium">EFT-POS Terminal</h3>
                <p className="text-sm text-gray-500">Harici POS cihazi</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>

        {/* Taksit */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-medium mb-3">Taksit Secenekleri</h3>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4, 6, 9, 12].map((months) => (
              <label key={months} className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={months <= 6} className="rounded" />
                <span className="text-sm">{months} Taksit</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReceiptSettings() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Fis Ayarlari</h2>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fis Basligi
          </label>
          <input
            type="text"
            defaultValue="KAHVE DUKKANI"
            className="input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Alt Bilgi
          </label>
          <textarea
            defaultValue="Bizi tercih ettiginiz icin tesekkurler!&#10;www.kahvedukkani.com"
            rows={3}
            className="input w-full"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm">Logo goster</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm">QR kod goster</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm">Vergi detayi goster</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Yazici
          </label>
          <select className="input w-full">
            <option>Yazici 1 (Epson TM-T88)</option>
            <option>Yazici 2 (Star TSP100)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fis Genisligi
          </label>
          <select className="input w-full">
            <option value="58">58mm</option>
            <option value="80">80mm</option>
          </select>
        </div>

        <div className="pt-4 border-t flex gap-2">
          <button className="btn btn-outline">Test Fisi Yazdir</button>
          <button className="btn btn-primary">Kaydet</button>
        </div>
      </div>
    </div>
  )
}

function DeviceSettings({ devices }: { devices: Device[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Cihazlar</h2>
        <button className="btn btn-primary">+ Cihaz Ekle</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {devices.map((device) => (
          <div key={device.id} className="bg-white rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {device.type === 'pos' ? '🖥️' : device.type === 'kds' ? '📺' : '🖨️'}
                </span>
                <div>
                  <h3 className="font-medium">{device.name}</h3>
                  <p className="text-sm text-gray-500">
                    {device.type === 'pos' ? 'POS Terminali' : device.type === 'kds' ? 'Mutfak Ekrani' : 'Yazici'}
                  </p>
                </div>
              </div>
              <span className={clsx(
                'px-2 py-1 rounded-full text-xs font-medium',
                device.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              )}>
                {device.status === 'online' ? 'Cevrimici' : 'Cevrimdisi'}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Son gorulme: {device.lastSeen.toLocaleTimeString('tr-TR')}
              </span>
              <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                Ayarlar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
