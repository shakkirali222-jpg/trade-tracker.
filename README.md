# Log Broker — wood logs broker app

A phone app for a wood logs broker: record each deal between a wood supplier and a plywood company, attach the weight slip, keep a voice note, and see your sales and brokerage in charts.

It is a single-user web app that installs on the phone ("Add to Home screen"), works offline, and keeps all data on the phone (IndexedDB). No server or login needed.

## Features

**Orders**
- Date, supplier and buyer (pick from the list or add a new one right there), wood type (pick from the list or add a new one), weight (ton/kg), rate.
- **Scan weight slip**: take a photo of the weighbridge slip and the app reads the net weight (or gross − tare), vehicle number, date, slip number, party and wood, fills the order and attaches the photo. Runs on the phone (bundled Tesseract OCR); works best on clear printed slips.
- Total = weight × rate automatically, or type the total yourself.
- Brokerage is calculated automatically (default **1%**). The brokerage amount and % are linked: type either one and the other updates.
- Mark brokerage as received or pending, and see how much brokerage is still to collect.
- Weight slip photos (camera or gallery, several per order; images are compressed to save space) and a slip number.
- Vehicle number and notes.
- Share an order (with slip photos) on WhatsApp or other apps.

**Audio**
- Record a **voice note** for each order and play it back later.
- **Speak the order**: say *"Supplier Rahim, buyer Greenply, rubber 12 ton rate 6500, vehicle KL 10 AB 1234"* and the form fills itself.
- **Dictate** notes by voice (English, Malayalam, Tamil, Kannada, Hindi, Telugu).

**Charts**
- Home dashboard: Day / Week / Month / Year, with arrows to move between periods. Shows sales, brokerage, order count, weight and % change vs the previous period, plus a sales and brokerage chart (tap a bar to jump to that period).
- Top suppliers and buyers for the period.
- Reports per supplier or buyer: sales and average price per ton over time (daily, weekly, monthly or yearly, any date range); who they traded with; their order list.
- Compare all suppliers or all buyers: price trend lines, stacked sales and a ranking table.

**Price check**
- Take a photo of the logs loaded on the lorry, choose the wood and log size (and weight if you know it). The app suggests a price per ton with a fair range, the load value and your brokerage.
- It learns from your past orders: wood photos, log size (small / medium / big), weight and the price you agreed. Past loads that look similar, or have the same log size, tell it whether this load should be priced above or below the market.
- Shows the 3 most similar past loads with their photos and prices. "Create order at this price" opens a new order already filled in.
- Orders now have a **Wood photos** section and a **Log size** choice so Price check keeps learning.

**Wood prices and price alerts**
- Reports → Wood prices: price per ton of each wood type by day, week, month or year; lowest and highest price; cheapest suppliers and best-paying buyers for each wood.
- Price outlook from the first bills: for each wood the app predicts the price for the next 3 weeks, plus 6 and 10 months ahead, with a confidence level and a "Why?" breakdown:
  - **Your bills** – recent price trend in your bills (weighted by tonnage, newer bills count more).
  - **Season** – the usual Kerala log cycle (dry Jan–Mar = most felling and lower prices; monsoon Jun–Sep and Oct–Nov rains = felling and transport stop, higher prices). After a year it also uses your own last-year pattern.
  - **Weather** – rain forecast for your area (Open-Meteo). More rainy days than usual pushes prices up. The app also checks past rain against your bills to learn how much rain really moved your prices.
  - **Yearly rise** – normal slow rise (5%/year to start; learned from your bills after 6 months).
- Shown on Home and Reports; optional daily phone notification.

**Everyday things**
- Supplier/buyer contacts with Call and WhatsApp buttons.
- Search and filter orders (date range, brokerage due or received).
- Backup to a file (share it to Google Drive or WhatsApp) and restore it; export to Excel (CSV).
- Light and dark theme, ₹ formatting in lakh and crore, sample data to try the app.

## Run it

Any static file server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

To use it on a phone, host the folder on any HTTPS static host (for example GitHub Pages: Settings → Pages → deploy from this branch). Open the link in Chrome on the phone and choose **Add to Home screen**. HTTPS is needed for the microphone, camera and offline mode.

## Files

- `index.html` – app shell
- `css/style.css` – styles (light and dark)
- `js/db.js` – IndexedDB storage
- `js/app.js` – screens, charts, voice, backup
- `sw.js`, `manifest.webmanifest`, `icons/` – install and offline support
- `js/smart.js` – weight slip scanning and price outlook
- `js/pricing.js` – Price check (photo fingerprints and price suggestion)
- `vendor/chart.umd.js` – Chart.js 4.4.6 (MIT), bundled so charts work offline
- `vendor/ocr/` – Tesseract.js 5.1.1 + English data (Apache 2.0), used for slip scanning

---

Designed & developed by **Shakkir Ali**.
