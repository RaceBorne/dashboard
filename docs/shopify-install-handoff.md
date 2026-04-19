# Shopify install — handoff notes

Short, exact steps to finish connecting the dashboard to the Evari Shopify store.
Open Cursor → open the integrated terminal (`Ctrl-\`` or Terminal → New Terminal) → follow these in order.

---

## What's already done

- Custom app `Evari Dashboard` created in Shopify Dev Dashboard
- App version `evari-dashboard-2` released with wide scopes (products, orders, customers, content, themes, discounts, etc.)
- Redirect URL set to `http://localhost:3000/api/shopify/callback`
- `/api/shopify/callback` route built — it exchanges the OAuth code for an offline token and writes it into `.env.local`
- `.env.local` already has:
  - `SHOPIFY_STORE_DOMAIN=zgx6s7-ww.myshopify.com`
  - `SHOPIFY_CLIENT_ID=320ecb1a3ce6871d648e0453ef7132ed`
  - `SHOPIFY_CLIENT_SECRET=<set>`

---

## What's left

### 1. Kill any dev servers stuck on port 3000

In Cursor's terminal:

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; echo "port 3000 free"
```

That force-kills anything squatting on port 3000, silently. Run it once; if you see `port 3000 free`, you're good.

### 2. Start the dev server

```bash
npm run dev
```

Wait for:

```
- Local:    http://localhost:3000
- Environments: .env.local
✓ Ready in ...ms
```

**Leave this terminal alone** — it needs to keep running. Open a second terminal if you need to type more commands.

### 3. Install the app

1. Browser → `https://dev.shopify.com/dashboard`
2. Click your org (Evari) → Apps → **Evari Dashboard**
3. On Overview, click the **Install app** button (top-right)
4. Shopify will redirect to `zgx6s7-ww.myshopify.com`'s admin
5. Review the scopes and click **Install**
6. Your browser lands back on `http://localhost:3000/api/shopify/callback?...` — our route captures the token and shows a confirmation page:
   > Evari Dashboard ✓ connected to Shopify

### 4. Restart the dev server

Back in the terminal running `npm run dev`:

- Press `Ctrl-C` to stop
- Run `npm run dev` again

This is required so Next picks up `SHOPIFY_ADMIN_ACCESS_TOKEN` which was just written to `.env.local`.

### 5. Verify

Visit each in a browser:

- `http://localhost:3000/api/shopify/status` — should show `"connected": true` plus a `shop` block with the store name
- `http://localhost:3000/api/shopify/products` — should list actual Evari products (look for `"mock": false`)
- `http://localhost:3000/api/shopify/customers` — real customers (look for `"mock": false`)

Note: the `/status` route uses `connected: true|false`. Product/customer/order/etc. routes use `mock: true|false` — different shape, same meaning.

If status shows `"connected": false` after install, the token didn't get written — re-check `.env.local` to make sure `SHOPIFY_ADMIN_ACCESS_TOKEN` has a value.

### 6. Rotate the secret (security)

Since we pasted the Client Secret into chat:

1. Dev Dashboard → Evari Dashboard → Settings → Secret row → **Rotate**
2. Copy the new secret
3. Edit `.env.local` line `SHOPIFY_CLIENT_SECRET="..."` with the new value
4. Restart `npm run dev`

(The access token stays valid across secret rotations — you don't have to reinstall.)

---

## Common errors + fixes

| Symptom | Fix |
|---|---|
| `zsh: no matches found: (Personal)/Evari` on cd | Wrap path in double quotes: `cd "/Users/craigmcdonald/Dropbox (Personal)/..."` |
| `Port 3000 is in use, using 3002 instead` | Kill existing process: `lsof -ti:3000 \| xargs kill -9` then `npm run dev` |
| Callback page shows "Token exchange failed" | `.env.local` secret doesn't match the Dev Dashboard secret — copy it fresh |
| `"mock": true` on status endpoint after install | You didn't restart the dev server after the callback wrote the token |
| `application_cannot_be_found` in Shopify callback | Redirect URL in the released app version doesn't match `localhost:3000/api/shopify/callback` — create a new app version |

---

## When it's done

Ping me and I'll start building the `/shopify` dashboard page that actually uses this connection — products table with inline SEO editing, orders view, discount creation, etc.
