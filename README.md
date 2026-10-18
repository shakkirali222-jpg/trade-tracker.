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

**Wood prices and price alerts**
- Reports → Wood prices: price per ton of each wood type by day, week, month or year; lowest and highest price; cheapest suppliers and best-paying buyers for each wood.
- After 1 year of orders, the app predicts whether each wood's price may go up or down in the next 2–3 weeks. The forecast uses how prices moved at the same time in earlier years plus the last 4 weeks' trend. It shows on the Home page and, if turned on, as a phone notification.

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
- `vendor/chart.umd.js` – Chart.js 4.4.6 (MIT), bundled so charts work offline
- `vendor/ocr/` – Tesseract.js 5.1.1 + English data (Apache 2.0), used for slip scanning

---

Designed & developed by **Shakkir Ali**.
