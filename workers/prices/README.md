# tameru-prices

Closing prices for Tameru's experimental investment prices. Yahoo Finance's quote
endpoints can't be called from the app (no CORS), so the app asks this Worker once
after each market close, up to 20 symbols per request.

- `GET /?symbols=XEQT.TO,VFV.TO,PSI,USDCAD=X` → `{ prices: { SYMBOL: { price, prevClose, currency, time } }, missing: [...] }`
- Only `app.tameru.cc` and `localhost` may call it from a browser.
- Stores nothing. Yahoo's endpoint is unofficial and may change or stop working.

## Deploy

```sh
cd workers/prices
npx wrangler deploy
```

Then add the custom domain `prices.tameru.cc` (Workers & Pages → tameru-prices →
Settings → Domains & Routes). The app reads its address from `VITE_PRICES_URL`,
defaulting to `https://prices.tameru.cc`.
