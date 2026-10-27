# Price Book — supplier price tracker

A simple, phone-friendly web app to record supplier prices, search them, and check new quotations against what you've paid before.

## What it does

- **Add prices** — upload an invoice or quotation (PDF, JPG, PNG, or take a photo), or **paste** a photo or message copied from WhatsApp. The app reads product names, unit prices, quantities, date, and supplier details (name, phone, email, address, TRN). You check the result, fix anything, and save. **The file itself is never stored**, only the extracted data. You can also type prices by hand.
- **Price history** — the same product bought again (even written slightly differently, e.g. "OPC Cement 50kg" vs "Cement OPC 50 kg bag") is linked automatically and saved with its new date and supplier. Sizes are respected: 12mm and 16mm rebar stay separate.
- **Search** — by product name or supplier name, with category and supplier filters.
- **Check a quote** — upload a new quotation and get a clear comparison for each item: cheaper / same / slightly higher / much higher than your best previous price, who offered the best price and when, what the same supplier charged last time, plus the total possible saving and plain-language advice on what to negotiate.
- **Material categories** — Cement & Concrete, Steel & Metal, Electrical, Plumbing, Paint, Tiles, and more. Assigned automatically; add or rename your own in Settings.
- **Product pages** — best current price, lowest/highest/average, a trend chart per supplier, and the full history.
- **Import many / WhatsApp** — pick a WhatsApp chat export (.zip, any size — it is opened on the phone, not uploaded) or select many PDFs and photos at once. Every invoice, quotation and purchase order inside is read one by one; photos that aren't price documents are skipped; you review and save. Files already imported are skipped next time, and you can limit it to recent messages.
- **Material list pricing** — upload a material list (Excel, PDF, photo, text) or paste it, and the app fills in the best price and supplier for each line, an estimated total, the cheapest supplier split, and what one supplier alone would cost. Missing prices can go straight into a quote request. Lists can be saved and re-priced later.
- **Compare several quotes** — 2–6 quotations side by side: cheapest supplier per item, totals with VAT and delivery, payment terms, delivery time, supplier rating, and the best "mix".
- **Request quotes** — pick materials and suppliers; a ready-made WhatsApp message opens for each supplier.
- **Share on WhatsApp** — priced lists, comparisons, supplier price lists, reports and projects.
- **VAT, delivery & payment terms** on every quote and invoice.
- **Unit conversion** — kg/ton, m/ft, l/ml, pcs/dozen…, plus a pack size per product (1 bag = 50 kg) so prices in different units compare fairly.
- **Price alerts** — warns when a new price is above your best price by more than your chosen % (default 10%).
- **Supplier notes & rating**, usual payment terms and delivery time.
- **Projects / sites** — tag quotes and invoices; see spend per project.
- **Monthly report** — purchases, top suppliers and categories, price changes, a 12-month chart; share or download.
- **Team price book** — the owner can switch to one shared book for everyone the page is shared with (Contributor or Editor).
- **Ask AI** — an assistant that answers questions about your saved prices ("Which supplier is cheapest for cement?", "Show the price history of 12mm rebar"). It looks up your data with built-in tools and never makes up prices.
- **Suppliers** — contact details and which products each supplier is cheapest for.
- **Backup** — download/restore a backup file, export to Excel (CSV). Light and dark mode.

## AI (reading invoices and Ask AI)

- **Inside claude.ai** (the published artifact link): Claude works through your own Claude account — no API key needed. claude.ai asks you to allow it the first time.
- **With an Anthropic API key** (Settings → AI document reading): Claude reads PDFs, scans and phone photos accurately. Get a key at <https://console.anthropic.com>. The key is stored only in your browser.
- **Without a key**: a basic offline reader handles clear, computer-made PDFs and simple photos. Always check the lines before saving.

## Where data is stored

Inside the Claude app or claude.ai, your price book is saved privately to your Claude account (it survives closing the app and appears on all your devices). Elsewhere it is saved in the browser only. **Settings → Download backup** makes a backup file you can restore anywhere.

## Running it

It's a static site with no build step.

- **GitHub Pages:** repository Settings → Pages → "Deploy from a branch" → pick the branch and `/ (root)`. Open the URL on your phone and use "Add to Home Screen" to install it like an app.
- **Locally:** `python3 -m http.server` in this folder, then open <http://localhost:8000>.

## Files

```
index.html            page shell and navigation
css/styles.css        design (light/dark)
js/app.js             screens: dashboard, add, search, compare, product, suppliers, settings
js/store.js           local data storage, suppliers/products/prices
js/extract.js         invoice reading (claude.ai, Claude API, or offline fallback)
js/assistant.js       Ask AI agent and its read-only price-lookup tools
js/match.js           fuzzy product-name matching
js/sync.js            saving to Claude (private per person, or a shared team book)
js/ui.js              shared helpers: forms, upload/paste widget, dialogs, WhatsApp sharing
js/units.js           unit conversion
js/importer.js        WhatsApp export / many-files import
js/materials.js       material list pricing
js/multiquote.js      side-by-side quote comparison
js/request.js         quote requests to suppliers
js/reports.js         monthly report, projects / sites
js/chart.js           price trend chart
```
