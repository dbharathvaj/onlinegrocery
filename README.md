# D.K. Raju General Store

A JavaScript online grocery ordering application with a React storefront, Express REST API, and MongoDB persistence. Product and delivery data are entered by the store owner; no catalogue, prices, address, phone number, or service villages are prefilled.

## Requirements

- Node.js 20.19 or newer
- MongoDB locally or a MongoDB Atlas database
- An administrator email and strong password for the initial admin account

## Run locally

1. Install the root development runner and application dependencies:

   ```powershell
   npm install
   npm install --prefix client
   npm install --prefix server
   Copy-Item server/.env.example server/.env
   ```

2. Edit `server/.env`. Set `MONGODB_URI`, a long random `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. The first server startup creates the admin account only when the configured email does not already exist. There is no public default password.

3. Start MongoDB, then run both application processes:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:5173`. The API listens on `http://localhost:3001`; Vite proxies `/api` requests to it.

4. Open **Store admin**, sign in, add categories and products, then enter the shop's real service villages, delivery charge, minimum order, address, contact number, and estimate. Online checkout remains unavailable until at least one service village is configured.

## Environment and optional services

The server reads `server/.env`; `server/.env.example` lists every supported variable. Never commit the real `.env` file.

- MongoDB: use a local database URI or an Atlas URI with network access restricted to the deployed server.
- Admin: configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` before the first start. Keep the password secret and rotate it through a secure operational process.
- Product photos: an administrator may provide an image URL. Server-side uploads require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; uploads accept JPG, PNG, or WebP up to 5 MB.
- UPI: Razorpay Checkout is enabled only when both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Use test-mode credentials first. Order totals are calculated by the API, and payment signatures plus captured amount/currency are checked server-side. The app does not collect UPI PINs or card details.
- SMS/WhatsApp notifications are not configured or sent by this application. Order confirmation is shown in the storefront and new orders appear in the admin dashboard.

## Checks and production build

```powershell
npm test
npm run build
```

The current tests cover mobile-number validation, delivery-area matching, and server-side total calculation. Database-backed flows and live Cloudinary/Razorpay calls require configured services and have not been verified in this workspace.

For deployment, build the client with `npm run build`, serve `client/dist` from the chosen frontend host, and run the Express server with `npm start --prefix server`. Set `NODE_ENV=production`, `CLIENT_ORIGIN` to the exact frontend origin, and use HTTPS so the admin cookie is secure. Keep the browser and API on the same site where possible; configure CORS and cookie policy deliberately when using separate domains. Do not expose server secrets to Vite or the browser.

## Business behavior

- Only active products with positive stock appear in the customer catalogue.
- Checkout accepts guest orders, verifies the service village and stock on the server, uses current database prices, and records historical item snapshots.
- Stock is reserved using atomic per-product updates and restored when an order is cancelled or an online payment fails. MongoDB replica-set transactions are not currently used; the order flow uses compensating stock updates.
- Order tracking requires both the order number and matching mobile number and omits customer address/contact details from the response.
- Admin reports distinguish gross order value from collected payment. Profit is not shown because purchase costs are not configured.
- The customer-facing navigation, checkout, core labels, and order statuses support English and Telugu. Product names remain as entered by the store owner; the admin interface is English.
- Cash on Delivery is available without payment credentials. Razorpay/UPI, Cloudinary uploads, and production deployment still require the merchant's own configuration and live verification.