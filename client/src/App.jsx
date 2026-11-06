import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { ArrowRight, Check, Minus, Plus, Search, ShoppingBag, Store, Trash2, X } from 'lucide-react'
import AdminPanel from './AdminPanel.jsx'
import './App.css'

const words = {
  en: { shop: 'Shop', track: 'Track order', admin: 'Store admin', search: 'Search groceries', all: 'All items', featured: 'Shop favourites', browse: 'Good food, close to home.', browseSub: 'Your neighbourhood store, now a little closer.', delivery: 'Delivery to selected villages', add: 'Add', cart: 'Your basket', empty: 'Your basket is empty', checkout: 'Continue to checkout', subtotal: 'Subtotal', deliveryFee: 'Delivery', total: 'Total', name: 'Your name', mobile: 'Mobile number', village: 'Village / locality', address: 'Delivery address', note: 'Delivery note (optional)', cod: 'Cash on delivery', upi: 'Pay online with UPI', place: 'Place order', close: 'Close', noProducts: 'No groceries match that search.', loading: 'Loading groceries…', unable: 'We could not load the store. Please try again shortly.', trackTitle: 'Track your order', orderNumber: 'Order number', lookup: 'Find my order', placed: 'Order placed', thank: 'Thank you. Your order is with the store.', order: 'Order', status: 'Status', lang: 'తెలుగు', categories: 'Categories', service: 'Delivery information', outOfArea: 'Delivery service area has not been configured yet. Please contact the store.', checkoutTitle: 'Delivery details', minOrder: 'Minimum order', contact: 'Store contact', continue: 'Continue shopping' },
  te: { shop: 'షాపింగ్', track: 'ఆర్డర్ స్థితి', admin: 'షాప్ నిర్వహణ', search: 'సరుకులు వెతకండి', all: 'అన్ని సరుకులు', featured: 'మీకు నచ్చినవి', browse: 'మీ ఇంటికి దగ్గరలోనే మంచి సరుకులు.', browseSub: 'మీ పక్కనే ఉన్న కిరాణా షాపు, ఇప్పుడు మరింత దగ్గరగా.', delivery: 'ఎంచుకున్న గ్రామాలకు డెలివరీ', add: 'చేర్చండి', cart: 'మీ బుట్ట', empty: 'మీ బుట్ట ఖాళీగా ఉంది', checkout: 'చెకౌట్‌కు వెళ్లండి', subtotal: 'మొత్తం ధర', deliveryFee: 'డెలివరీ', total: 'చెల్లించాల్సిన మొత్తం', name: 'మీ పేరు', mobile: 'మొబైల్ నంబర్', village: 'గ్రామం / ప్రాంతం', address: 'డెలివరీ చిరునామా', note: 'డెలివరీ సూచన (ఐచ్ఛికం)', cod: 'వస్తువులు అందినప్పుడు నగదు', upi: 'UPI ద్వారా ఆన్‌లైన్ చెల్లింపు', place: 'ఆర్డర్ చేయండి', close: 'మూసివేయండి', noProducts: 'ఈ వెతుకులాటకు సరుకులు లేవు.', loading: 'సరుకులు తెస్తున్నాము…', unable: 'షాప్ తెరవడం సాధ్యం కాలేదు. కొద్దిసేపటి తర్వాత ప్రయత్నించండి.', trackTitle: 'మీ ఆర్డర్ స్థితి', orderNumber: 'ఆర్డర్ నంబర్', lookup: 'ఆర్డర్ చూడండి', placed: 'ఆర్డర్ నమోదైంది', thank: 'ధన్యవాదాలు. మీ ఆర్డర్ షాప్‌కు చేరింది.', order: 'ఆర్డర్', status: 'స్థితి', lang: 'English', categories: 'వర్గాలు', service: 'డెలివరీ వివరాలు', outOfArea: 'డెలివరీ ప్రాంతం ఇంకా సెట్ కాలేదు. దయచేసి షాప్‌ను సంప్రదించండి.', checkoutTitle: 'డెలివరీ వివరాలు', minOrder: 'కనీస ఆర్డర్', contact: 'షాప్ సంప్రదింపు', continue: 'కొనసాగించండి' },
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData
  let response
  try {
    response = await fetch(path, { ...options, credentials: 'include', signal: options.signal || AbortSignal.timeout(12000), headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...options.headers } })
  } catch {
    throw new Error('Store service is unavailable. Please try again shortly.')
  }
  if (response.status === 204) return null
  const data = (response.headers.get('content-type') || '').includes('application/json') ? await response.json().catch(() => null) : null
  if (!response.ok) throw new Error(data?.message || (response.status >= 500 ? 'Store service is unavailable. Please try again shortly.' : 'Request failed. Please try again.'))
  if (!data) throw new Error('Store service is unavailable. Please try again shortly.')
  return data
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function App() {
  const [language, setLanguage] = useState(localStorage.getItem('dk-language') || 'en')
  const t = (key) => words[language][key] || words.en[key] || key
  function changeLanguage() {
    const next = language === 'en' ? 'te' : 'en'
    localStorage.setItem('dk-language', next)
    setLanguage(next)
  }
  return <BrowserRouter><Routes>
    <Route path="/" element={<Shop language={language} t={t} changeLanguage={changeLanguage} />} />
    <Route path="/track" element={<Tracking language={language} t={t} changeLanguage={changeLanguage} />} />
    <Route path="/admin/*" element={<AdminPanel />} />
  </Routes></BrowserRouter>
}

function Header({ t, changeLanguage, count = 0, onCart }) {
  return <header className="topbar">
    <Link to="/" className="brand" aria-label="D.K. Raju General Store home"><span className="brand-mark"><Store size={20} /></span><span><strong>D.K. Raju</strong><small>GENERAL STORE</small></span></Link>
    <nav className="main-nav" aria-label="Main navigation"><Link to="/">{t('shop')}</Link><Link to="/track">{t('track')}</Link></nav>
    <div className="header-actions"><button className="language-button" onClick={changeLanguage} type="button">{t('lang')}</button>{onCart && <button className="cart-button" onClick={onCart} type="button" aria-label={`${t('cart')}, ${count} items`}><ShoppingBag size={19} /><span>{count}</span></button>}</div>
  </header>
}

function Shop({ language, t, changeLanguage }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)
  const [paymentConfig, setPaymentConfig] = useState({ upiEnabled: false })
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('dk-cart') || '[]'))
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [placedOrder, setPlacedOrder] = useState(null)
  const [busy, setBusy] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const orderKey = useRef(localStorage.getItem('dk-order-key') || crypto.randomUUID())

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([request(`/api/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`), request('/api/categories'), request('/api/settings'), request('/api/payments/config')])
      .then(([catalogue, groups, store, payment]) => { if (active) { setProducts(catalogue.products); setCategories(groups); setSettings(store); setPaymentConfig(payment); setProblem('') } })
      .catch((error) => { if (active) setProblem(error.message || t('unable')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, category, t])
  useEffect(() => { localStorage.setItem('dk-cart', JSON.stringify(cart)) }, [cart])

  const count = cart.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const deliveryFee = Number(settings?.deliveryCharge) || 0
  function addProduct(product) {
    setCart((current) => {
      const found = current.find((item) => item._id === product._id)
      return found ? current.map((item) => item._id === product._id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item) : [...current, { ...product, quantity: 1 }]
    })
    setNotice(`${product.name} added`)
    window.setTimeout(() => setNotice(''), 1800)
  }
  function changeQuantity(id, amount) {
    setCart((current) => current.map((item) => item._id === id ? { ...item, quantity: Math.min(item.stock, item.quantity + amount) } : item).filter((item) => item.quantity > 0))
  }
  async function submitOrder(event) {
    event.preventDefault()
    const formFields = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    try {
      localStorage.setItem('dk-order-key', orderKey.current)
      const result = await request('/api/orders', { method: 'POST', body: JSON.stringify({ ...formFields, paymentMethod, items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })), idempotencyKey: orderKey.current }) })
      if (paymentMethod === 'upi' && result.order.paymentStatus === 'paid') {
        setPlacedOrder(result.order); setCart([]); setCheckoutOpen(false); setCartOpen(false)
        localStorage.removeItem('dk-order-key'); orderKey.current = crypto.randomUUID()
        return
      }
      if (paymentMethod === 'upi') {
        const sdkLoaded = await loadRazorpay()
        if (!sdkLoaded) {
          await request('/api/payments/fail', { method: 'POST', body: JSON.stringify({ gatewayOrderId: result.payment.gatewayOrderId }) }).catch(() => {})
          throw new Error('Online payment could not be opened. Please try again or choose cash on delivery.')
        }
        const failPayment = async () => {
          await request('/api/payments/fail', { method: 'POST', body: JSON.stringify({ gatewayOrderId: result.payment.gatewayOrderId }) }).catch(() => {})
          localStorage.removeItem('dk-order-key'); orderKey.current = crypto.randomUUID()
          setNotice('Payment was not completed. Your order was not placed; please try again.')
        }
        const checkout = new window.Razorpay({
          key: result.payment.keyId,
          amount: result.payment.amount,
          currency: result.payment.currency,
          name: 'D.K. Raju General Store',
          description: result.order.orderNumber,
          order_id: result.payment.gatewayOrderId,
          prefill: { name: result.order.customerName, contact: formFields.mobile },
          handler: async (response) => {
            try {
              const verified = await request('/api/payments/verify', { method: 'POST', body: JSON.stringify({ ...response, orderNumber: result.order.orderNumber }) })
              setPlacedOrder(verified.order); setCart([]); setCheckoutOpen(false); setCartOpen(false)
              localStorage.removeItem('dk-order-key'); orderKey.current = crypto.randomUUID()
            } catch (error) { setNotice(error.message) }
          },
          modal: { ondismiss: failPayment },
        })
        checkout.on('payment.failed', failPayment)
        checkout.open()
        return
      }
      setPlacedOrder(result.order); setCart([]); setCheckoutOpen(false); setCartOpen(false)
      localStorage.removeItem('dk-order-key'); orderKey.current = crypto.randomUUID()
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  return <div className="site-shell">
    <Header t={t} changeLanguage={changeLanguage} count={count} onCart={() => setCartOpen(true)} />
    <main>
      <section className="hero-band"><div className="hero-copy"><p className="eyebrow">{settings?.shopName || 'D.K. Raju General Store'}</p><h1>{t('browse')}</h1><p className="hero-subtitle">{t('browseSub')}</p><a className="hero-link" href="#catalogue">{t('shop')} <ArrowRight size={16} /></a></div><div className="hero-photo" role="img" aria-label="Fresh vegetables and groceries" /></section>
      <section className="store-strip" aria-label={t('service')}><span><span className="status-dot" />{t('delivery')}</span><span>{settings?.estimatedDelivery || ''}</span>{settings?.phone && <a href={`tel:${settings.phone}`}>{settings.phone}</a>}</section>
      <section id="catalogue" className="catalogue-section">
        <div className="catalogue-heading"><div><p className="eyebrow">{t('categories')}</p><h2>{t('featured')}</h2></div><label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} aria-label={t('search')} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</label></div>
        <div className="category-list" aria-label={t('categories')}><button type="button" className={!category ? 'selected' : ''} onClick={() => setCategory('')}>{t('all')}</button>{categories.map((item) => <button key={item._id} type="button" className={category === item._id ? 'selected' : ''} onClick={() => setCategory(item._id)}>{language === 'te' && item.nameTe ? item.nameTe : item.name}</button>)}</div>
        {loading ? <p className="state-message">{t('loading')}</p> : problem ? <p className="state-message error-message">{problem}</p> : products.length === 0 ? <p className="state-message">{t('noProducts')}</p> : <div className="product-grid">{products.map((product) => <article className="product-item" key={product._id}><div className="product-image">{product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <ShoppingBag size={30} aria-hidden="true" />}{product.featured && <span className="product-badge">{t('featured')}</span>}</div><div className="product-info"><p className="product-category">{language === 'te' && product.category?.nameTe ? product.category.nameTe : product.category?.name}</p><h3>{product.name}</h3><p className="product-unit">{product.unit}</p><div className="product-buy"><strong>{money(product.price)}</strong><button type="button" onClick={() => addProduct(product)} aria-label={`${t('add')} ${product.name}`}><Plus size={16} />{t('add')}</button></div></div></article>)}</div>}
      </section>
      <section className="store-details"><div><p className="eyebrow">{t('service')}</p><h2>{settings?.shopName || 'D.K. Raju General Store'}</h2><p>{settings?.address || ' '}</p></div><div className="detail-list">{settings?.phone && <p>{t('contact')}: <a href={`tel:${settings.phone}`}>{settings.phone}</a></p>}<p>{t('minOrder')}: {money(settings?.minimumOrder)}</p><p>{settings?.serviceVillages?.join(' · ')}</p></div></section>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} D.K. Raju General Store</span><Link to="/admin">{t('admin')}</Link></footer>

    {cartOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false) }}><aside className="drawer" aria-label={t('cart')}>
      <div className="drawer-heading"><h2>{t('cart')} <span>({count})</span></h2><button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label={t('close')}><X size={20} /></button></div>
      {placedOrder ? <div className="order-success"><span className="success-mark"><Check size={26} /></span><p className="eyebrow">{t('placed')}</p><h3>{t('thank')}</h3><p>{t('order')}: <strong>{placedOrder.orderNumber}</strong></p><p>{money(placedOrder.total)}</p><Link to="/track" className="primary-button" onClick={() => setPlacedOrder(null)}>{t('track')}</Link></div> : cart.length === 0 ? <p className="empty-cart">{t('empty')}</p> : <>
        <div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item._id}><div className="cart-thumb">{item.image ? <img src={item.image} alt="" /> : <ShoppingBag size={20} />}</div><div className="cart-line-main"><strong>{item.name}</strong><small>{money(item.price)} / {item.unit}</small><div className="quantity-control"><button type="button" onClick={() => changeQuantity(item._id, -1)} aria-label="Decrease quantity"><Minus size={14} /></button><span>{item.quantity}</span><button type="button" onClick={() => changeQuantity(item._id, 1)} aria-label="Increase quantity"><Plus size={14} /></button></div></div><strong>{money(item.price * item.quantity)}</strong><button className="remove-button" type="button" aria-label={`Remove ${item.name}`} onClick={() => setCart((current) => current.filter((product) => product._id !== item._id))}><Trash2 size={16} /></button></div>)}</div>
        <div className="cart-totals"><p><span>{t('subtotal')}</span><strong>{money(subtotal)}</strong></p><p><span>{t('deliveryFee')}</span><strong>{money(deliveryFee)}</strong></p><p className="grand-total"><span>{t('total')}</span><strong>{money(subtotal + deliveryFee)}</strong></p></div>
        {settings?.serviceVillages?.length ? <button className="primary-button full-button" type="button" onClick={() => setCheckoutOpen(true)}>{t('checkout')} <ArrowRight size={17} /></button> : <p className="notice-box">{t('outOfArea')}</p>}
      </>}
    </aside></div>}

    {checkoutOpen && <div className="overlay modal-overlay"><section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="drawer-heading"><h2 id="checkout-title">{t('checkoutTitle')}</h2><button className="icon-button" type="button" onClick={() => setCheckoutOpen(false)} aria-label={t('close')}><X size={20} /></button></div><form className="checkout-form" onSubmit={submitOrder}><label>{t('name')}<input name="name" required minLength="2" autoComplete="name" /></label><label>{t('mobile')}<input name="mobile" required inputMode="tel" pattern="(?:\+91\s?)?[6-9][0-9\s-]{9,13}" autoComplete="tel" /></label><label>{t('village')}<input name="village" list="service-villages" required /><datalist id="service-villages">{settings?.serviceVillages?.map((village) => <option key={village} value={village} />)}</datalist></label><label>{t('address')}<textarea name="address" required minLength="5" rows="2" autoComplete="street-address" /></label><label>{t('note')}<textarea name="instructions" rows="2" /></label><fieldset><legend>Payment method</legend><label className="radio-choice"><input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />{t('cod')}</label>{paymentConfig.upiEnabled && <label className="radio-choice"><input type="radio" name="paymentMethod" value="upi" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} />{t('upi')}</label>}</fieldset><div className="checkout-total"><span>{t('total')}</span><strong>{money(subtotal + deliveryFee)}</strong></div>{notice && <p className="form-error" role="alert">{notice}</p>}<button className="primary-button full-button" type="submit" disabled={busy}>{busy ? '…' : t('place')}</button></form></section></div>}
    {placedOrder && <div className="overlay modal-overlay"><section className="checkout-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title"><div className="success-mark"><Check size={26} /></div><p className="eyebrow">{t('placed')}</p><h2 id="confirmation-title">{t('thank')}</h2><p>{t('order')}: <strong>{placedOrder.orderNumber}</strong></p><p>{t('total')}: <strong>{money(placedOrder.total)}</strong></p><div className="confirmation-actions"><Link className="primary-button" to="/track" onClick={() => setPlacedOrder(null)}>{t('track')}</Link><button className="text-button" type="button" onClick={() => setPlacedOrder(null)}>{t('continue')}</button></div></section></div>}
    {notice && !checkoutOpen && !cartOpen && <div className="toast" role="status">{notice}</div>}
  </div>
}

function Tracking({ language, t, changeLanguage }) {
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function lookup(event) {
    event.preventDefault(); setBusy(true); setError(''); setOrder(null)
    try { setOrder((await request('/api/orders/lookup', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) })).order) }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }
  const statuses = ['placed', 'accepted', 'preparing', 'out-for-delivery', 'delivered']
  const statusLabels = language === 'te' ? { placed: 'ఆర్డర్ నమోదైంది', accepted: 'ఆమోదించబడింది', preparing: 'సిద్ధం చేస్తున్నాము', 'out-for-delivery': 'డెలివరీకి బయలుదేరింది', delivered: 'డెలివరీ పూర్తయింది', cancelled: 'రద్దు చేయబడింది' } : { placed: 'Order placed', accepted: 'Accepted', preparing: 'Preparing', 'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' }
  return <div className="site-shell"><Header t={t} changeLanguage={changeLanguage} /><main className="tracking-page"><Link className="back-link" to="/">← {t('continue')}</Link><p className="eyebrow">D.K. RAJU GENERAL STORE</p><h1>{t('trackTitle')}</h1><p className="page-intro">{language === 'te' ? 'మీ ఆర్డర్ నంబర్ మరియు మొబైల్ నంబర్ నమోదు చేయండి.' : 'Enter the order number and mobile number used at checkout.'}</p><form className="tracking-form" onSubmit={lookup}><label>{t('orderNumber')}<input name="orderNumber" required autoComplete="off" /></label><label>{t('mobile')}<input name="mobile" required inputMode="tel" /></label><button className="primary-button" disabled={busy}>{busy ? '…' : t('lookup')}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{order && <section className="tracking-result"><div className="tracking-result-head"><div><p className="eyebrow">{t('order')}</p><h2>{order.orderNumber}</h2></div><span className={`status-label status-${order.status}`}>{statusLabels[order.status]}</span></div><ol className="status-steps">{statuses.map((status) => <li key={status} className={statuses.indexOf(order.status) >= statuses.indexOf(status) && order.status !== 'cancelled' ? 'done' : ''}><span />{statusLabels[status]}</li>)}</ol>{order.status === 'cancelled' && <p>{statusLabels.cancelled}</p>}<div className="tracking-items">{order.items.map((item) => <p key={`${item.name}-${item.unit}`}>{item.name} × {item.quantity} <strong>{money(item.price * item.quantity)}</strong></p>)}</div><div className="tracking-total"><span>{t('total')}</span><strong>{money(order.total)}</strong></div></section>}</main><footer className="site-footer"><span>© {new Date().getFullYear()} D.K. Raju General Store</span><Link to="/admin">{t('admin')}</Link></footer></div>
}

export { request, money }
export default App
