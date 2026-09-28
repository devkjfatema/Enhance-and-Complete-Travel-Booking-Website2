# Prom Coast — plain HTML / CSS / JS

Open `index.html` in a browser (or serve the folder with any static server, e.g. `npx serve promcoast`).

Pages: index.html, map.html, towns.html, things-to-do.html, stay.html
- css/style.css  – compiled Tailwind + custom styles
- js/data.js     – towns, places, stays, categories (edit content here)
- js/app.js      – header/footer, search + booking dialog, Leaflet map, page rendering
- js/icons.js    – inline Lucide icons
- vendor/leaflet – Leaflet 1.9.4 (map tiles load from CARTO, needs internet)
- Set your Booking.com partner ID: BOOKING_AFFILIATE_ID at the top of js/app.js
