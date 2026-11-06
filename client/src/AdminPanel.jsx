import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Box, ClipboardList, LogOut, Plus, Settings, Store, Upload, X } from 'lucide-react'

async function api(path, options = {}) {
  const form = options.body instanceof FormData
  const response = await fetch(path, { ...options, credentials: 'include', headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...options.headers } })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || 'Request failed.')
  return data
}

const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)
const tabs = [
  { id: 'overview', label: 'Overview', icon: Store },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'products', label: 'Products', icon: Box },
  { id: 'categories', label: 'Categories', icon: Plus },
  { id: 'reports', label: 'Sales reports', icon: BarChart3 },
  { id: 'delivery', label: 'Delivery settings', icon: Settings },
]
const statuses = ['placed', 'accepted', 'preparing', 'out-for-delivery', 'delivered', 'cancelled']

export default function AdminPanel() {
  const [admin, setAdmin] = useState(null)
  const [view, setView] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)
  const [report, setReport] = useState(null)
  const [reportPeriod, setReportPeriod] = useState('daily')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  async function loadAdminData() {
    const [stats, orderList, productList, categoryList, delivery] = await Promise.all([
      api('/api/admin/overview'), api('/api/admin/orders'), api('/api/admin/products'), api('/api/admin/categories'), api('/api/admin/settings'),
    ])
    setOverview(stats); setOrders(orderList); setProducts(productList); setCategories(categoryList); setSettings(delivery)
  }

  useEffect(() => {
    api('/api/admin/me').then(({ admin: current }) => { setAdmin(current); return loadAdminData() }).catch(() => {}).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (!admin || view !== 'reports') return
    api(`/api/admin/reports?period=${reportPeriod}`).then(setReport).catch((error) => setNotice(error.message))
  }, [admin, view, reportPeriod])

  async function login(event) {
    event.preventDefault(); setBusy(true); setNotice('')
    try { const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setAdmin(result.admin); await loadAdminData() }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function logout() {
    try { await api('/api/admin/logout', { method: 'POST' }) } finally { setAdmin(null) }
  }

  async function saveProduct(event) {
    event.preventDefault(); setBusy(true); setNotice('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    for (const key of ['price', 'originalPrice', 'stock', 'lowStockAt']) fields[key] = fields[key] === '' ? null : Number(fields[key])
    fields.featured = fields.featured === 'on'
    fields.active = fields.active === 'on'
    try {
      await api(editing?._id ? `/api/admin/products/${editing._id}` : '/api/admin/products', { method: editing?._id ? 'PATCH' : 'POST', body: JSON.stringify(fields) })
      await loadAdminData(); setEditing(null); setNotice('Product saved.')
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function removeProduct(product) {
    if (!window.confirm(`Remove ${product.name} from the shop?`)) return
    try { await api(`/api/admin/products/${product._id}`, { method: 'DELETE' }); await loadAdminData(); setNotice('Product removed.') }
    catch (error) { setNotice(error.message) }
  }

  async function changeStatus(order, status) {
    try { await api(`/api/admin/orders/${order._id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadAdminData(); setNotice(`Order ${order.orderNumber} updated.`) }
    catch (error) { setNotice(error.message) }
  }

  async function changePayment(order, paymentStatus) {
    try { await api(`/api/admin/orders/${order._id}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentStatus }) }); await loadAdminData(); setNotice(`Payment for ${order.orderNumber} updated.`) }
    catch (error) { setNotice(error.message) }
  }

  async function saveSettings(event) {
    event.preventDefault(); setBusy(true); setNotice('')
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    fields.serviceVillages = String(fields.serviceVillages || '').split(',').map((village) => village.trim()).filter(Boolean)
    try { setSettings(await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(fields) })); setNotice('Delivery settings saved.') }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function addCategory(event) {
    event.preventDefault(); setBusy(true); setNotice('')
    try { await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setCategories(await api('/api/admin/categories')); event.currentTarget.reset(); setNotice('Category added.') }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function toggleCategory(category) {
    try { await api(`/api/admin/categories/${category._id}`, { method: 'PATCH', body: JSON.stringify({ active: !category.active }) }); setCategories(await api('/api/admin/categories')) }
    catch (error) { setNotice(error.message) }
  }

  async function uploadImage(event) {
    const image = event.target.files?.[0]
    if (!image) return
    const data = new FormData(); data.append('image', image)
    setBusy(true)
    try { const result = await api('/api/admin/images', { method: 'POST', body: data }); document.querySelector('[name="image"]').value = result.url; setNotice('Image uploaded.') }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false); event.target.value = '' }
  }

  if (checking) return <div className="admin-loading">Loading store controls...</div>
  if (!admin) return <main className="admin-login-page"><Link to="/" className="back-link"><ArrowLeft size={16} /> Storefront</Link><section className="login-panel"><span className="brand-mark"><Store size={20} /></span><p className="eyebrow">D.K. RAJU GENERAL STORE</p><h1>Store admin</h1><p>Sign in to manage products and orders.</p><form className="admin-form" onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{notice && <p className="form-error" role="alert">{notice}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button></form></section></main>

  return <div className="admin-layout">
    <aside className="admin-sidebar"><Link to="/" className="admin-brand"><span className="brand-mark"><Store size={20} /></span><span><strong>D.K. Raju</strong><small>STORE ADMIN</small></span></Link><nav aria-label="Admin sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={view === id ? 'active' : ''} onClick={() => { setView(id); setEditing(null); setNotice('') }}><Icon size={18} />{label}{id === 'orders' && overview?.newOrders > 0 && <span className="nav-count">{overview.newOrders}</span>}</button>)}</nav><div className="sidebar-bottom"><span>{admin.email}</span><button type="button" onClick={logout}><LogOut size={17} /> Sign out</button><Link to="/" className="storefront-link"><ArrowLeft size={16} /> Storefront</Link></div></aside>
    <main className="admin-main"><header className="admin-header"><div><p className="eyebrow">STORE MANAGEMENT</p><h1>{tabs.find((item) => item.id === view)?.label}</h1></div><button className="refresh-button" type="button" onClick={() => loadAdminData()}>Refresh</button></header>{notice && <p className="admin-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></p>}
      {view === 'overview' && <section><div className="stats-grid">{[['All orders', overview?.orders], ['New orders', overview?.newOrders], ['Delivered', overview?.deliveredOrders], ['Active products', overview?.products], ['Paid sales', currency(overview?.paidSales)]].map(([label, value]) => <article className="stat-item" key={label}><span>{label}</span><strong>{value ?? '-'}</strong></article>)}</div><div className="admin-section-heading"><h2>Low stock</h2><span>{overview?.lowStock?.length || 0} items</span></div>{overview?.lowStock?.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody>{overview.lowStock.map((item) => <tr key={item._id}><td>{item.name}</td><td>{item.stock} {item.unit}</td></tr>)}</tbody></table></div> : <p className="admin-empty">No low-stock products.</p>}</section>}

      {view === 'orders' && <section className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Delivery address</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleString()}</small>{order.items.map((item) => <small key={`${item.name}${item.unit}`}>{item.name} x {item.quantity}</small>)}</td><td>{order.customerName}<small><a href={`tel:${order.mobile}`}>{order.mobile}</a></small></td><td>{order.village}<small>{order.address}</small>{order.instructions && <small>Note: {order.instructions}</small>}</td><td>{currency(order.total)}</td><td>{order.paymentMethod === 'cod' ? <select aria-label={`Cash collection status for ${order.orderNumber}`} value={order.paymentStatus} onChange={(event) => changePayment(order, event.target.value)}>{['pending', 'paid'].map((status) => <option value={status} key={status}>{status === 'paid' ? 'Collected' : 'Pending'}</option>)}</select> : <>Online UPI<small>{order.paymentStatus}</small></>}</td><td><select aria-label={`Status for ${order.orderNumber}`} value={order.status} disabled={['cancelled', 'delivered'].includes(order.status)} onChange={(event) => changeStatus(order, event.target.value)}>{statuses.map((status) => <option value={status} key={status}>{status.replaceAll('-', ' ')}</option>)}</select></td></tr>)}</tbody></table>{orders.length === 0 && <p className="admin-empty">No orders yet.</p>}</section>}

      {view === 'products' && <section>{editing ? <form className="product-editor" onSubmit={saveProduct}><div className="admin-section-heading"><h2>{editing._id ? 'Edit product' : 'New product'}</h2><button className="icon-button" type="button" onClick={() => setEditing(null)} aria-label="Close editor"><X size={18} /></button></div><div className="admin-fields"><label>Product name<input name="name" required defaultValue={editing.name || ''} /></label><label>Category<select name="category" required defaultValue={editing.category?._id || editing.category || ''}><option value="">Select category</option>{categories.filter((item) => item.active).map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></label><label>Price (INR)<input name="price" type="number" min="0" step="0.01" required defaultValue={editing.price ?? ''} /></label><label>Original price (optional)<input name="originalPrice" type="number" min="0" step="0.01" defaultValue={editing.originalPrice ?? ''} /></label><label>Unit / size<input name="unit" required placeholder="e.g. 1 kg, 500 ml, packet" defaultValue={editing.unit || ''} /></label><label>Stock<input name="stock" type="number" min="0" step="1" required defaultValue={editing.stock ?? 0} /></label><label>Low-stock alert at<input name="lowStockAt" type="number" min="0" defaultValue={editing.lowStockAt ?? 5} /></label><label className="image-field">Image URL<input name="image" type="url" defaultValue={editing.image || ''} /><span><Upload size={15} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} aria-label="Upload product image" /></span></label><label className="wide-field">Description<textarea name="description" rows="3" defaultValue={editing.description || ''} /></label><label className="check-field"><input name="active" type="checkbox" defaultChecked={editing.active ?? true} /> Available to customers</label><label className="check-field"><input name="featured" type="checkbox" defaultChecked={editing.featured ?? false} /> Featured</label></div><button className="primary-button" disabled={busy}>Save product</button></form> : <><div className="admin-section-heading"><h2>Product catalogue <span>{products.length}</span></h2><button className="primary-button" type="button" onClick={() => setEditing({})}><Plus size={16} /> Add product</button></div><div className="product-admin-list">{products.map((product) => <article key={product._id}><div className="admin-product-image">{product.image ? <img src={product.image} alt="" /> : <Box size={20} />}</div><div className="admin-product-data"><strong>{product.name}</strong><span>{product.category?.name || 'Uncategorized'} Â· {product.unit}</span></div><strong>{currency(product.price)}</strong><span className={product.stock <= product.lowStockAt ? 'stock-low' : 'stock-ok'}>{product.stock} in stock</span><button className="text-button" type="button" onClick={() => setEditing(product)}>Edit</button><button className="text-button danger-text" type="button" onClick={() => removeProduct(product)}>Remove</button></article>)}{products.length === 0 && <p className="admin-empty">Add your first product to start the catalogue.</p>}</div></>}</section>}

      {view === 'categories' && <section><form className="category-form" onSubmit={addCategory}><label>Category name<input name="name" required /></label><label>Telugu name (optional)<input name="nameTe" /></label><button className="primary-button" disabled={busy}><Plus size={16} /> Add category</button></form><div className="category-admin-list">{categories.map((category) => <article key={category._id}><div><strong>{category.name}</strong><span>{category.nameTe || 'No Telugu name'}</span></div><span className={category.active ? 'stock-ok' : 'stock-low'}>{category.active ? 'Active' : 'Hidden'}</span><button className="text-button" type="button" onClick={() => toggleCategory(category)}>{category.active ? 'Hide' : 'Enable'}</button></article>)}</div></section>}

      {view === 'reports' && <section><div className="admin-section-heading"><h2>Sales reports</h2></div><div className="admin-fields"><label>Report period<select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>{['daily', 'weekly', 'monthly'].map((period) => <option value={period} key={period}>{period.charAt(0).toUpperCase() + period.slice(1)}</option>)}</select></label></div>{report ? <><div className="report-summary"><div><strong>Order count:</strong> {report.orders}</div><div><strong>Gross sales:</strong> {currency(report.grossSales)}</div><div><strong>Collected:</strong> {currency(report.collected)}</div></div><p className="report-note">Gross order value is not profit. Check individual items for details.</p><div className="table-wrap"><table><thead><tr><th>Product</th><th>Quantity</th><th>Sales</th></tr></thead><tbody>{report.bestSellers.map((item) => <tr key={item.product._id}><td>{item.product.name}</td><td>{item.quantity}</td><td>{currency(item.sales)}</td></tr>)}</tbody></table></div></> : <p className="admin-empty">No reports available for the selected period.</p>}</section>}

      {view === 'delivery' && settings && <form className="settings-form" onSubmit={saveSettings}><p className="settings-note">Only advertise villages the store can actually serve. Leaving the village list empty disables online checkout.</p><div className="admin-fields"><label>Shop name<input name="shopName" defaultValue={settings.shopName} required /></label><label>Store phone<input name="phone" defaultValue={settings.phone} inputMode="tel" /></label><label className="wide-field">Shop address<textarea name="address" rows="2" defaultValue={settings.address} /></label><label className="wide-field">Serviceable villages (comma separated)<textarea name="serviceVillages" rows="3" defaultValue={settings.serviceVillages?.join(', ')} /></label><label>Delivery charge (INR)<input name="deliveryCharge" type="number" min="0" step="0.01" defaultValue={settings.deliveryCharge} /></label><label>Minimum order (INR)<input name="minimumOrder" type="number" min="0" step="0.01" defaultValue={settings.minimumOrder} /></label><label>Estimated delivery time<input name="estimatedDelivery" placeholder="e.g. Same day" defaultValue={settings.estimatedDelivery} /></label></div><button className="primary-button" disabled={busy}>Save delivery settings</button></form>}
    </main>
  </div>
}
