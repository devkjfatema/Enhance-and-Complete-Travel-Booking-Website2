/* Prom Coast — plain JavaScript version of the React site.
   Depends on: data.js (categories, towns, places, stays), icons.js (ICONS), Leaflet (home + map pages). */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function icon(name, cls) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (cls || 'h-4 w-4') + '" aria-hidden="true">' + ICONS[name] + '</svg>';
  }
  var CAT_ICON = { stay: 'bed-double', beach: 'waves', walk: 'footprints', attraction: 'landmark', food: 'utensils', town: 'map-pin' };
  function catIcon(cat, cls) { return icon(CAT_ICON[cat] || 'map-pin', cls); }

  function getTown(slug) { return towns.find(function (t) { return t.slug === slug; }); }
  function getAreaLabel(area) {
    if (area === 'all') return 'the Prom Coast';
    var t = getTown(area); return t ? t.name : 'the Prom Coast';
  }
  function getAreaDestination(area) {
    var t = getTown(area);
    return t ? t.name + ', Victoria, Australia' : 'South Gippsland, Victoria, Australia';
  }
  function catColor(id) {
    var c = categories.find(function (x) { return x.id === id; });
    return c ? c.color : '#13303a';
  }
  function buildMapPoints() {
    var tp = towns.map(function (t) {
      return { id: 'town-' + t.slug, name: t.name, category: 'town', subtitle: t.tagline, blurb: t.description, townSlug: t.slug, lat: t.lat, lng: t.lng, image: t.image };
    });
    var sp = stays.map(function (s) {
      var t = getTown(s.townSlug);
      return { id: 'stay-' + s.id, name: s.name, category: 'stay', subtitle: s.type + ' · ' + (t ? t.name : '') + ' · from $' + s.priceFrom, blurb: s.highlights.join(' · '), townSlug: s.townSlug, lat: s.lat, lng: s.lng, image: s.image, stayId: s.id };
    });
    var pp = places.map(function (p) {
      return { id: p.id, name: p.name, category: p.category, subtitle: p.detail, blurb: p.blurb, townSlug: p.townSlug, lat: p.lat, lng: p.lng, image: p.image };
    });
    return tp.concat(sp, pp);
  }

  /* ---------- dates / booking ---------- */
  var BOOKING_AFFILIATE_ID = 'YOUR_AFFILIATE_ID'; // replace with your Booking.com Partner ID
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function today() { return fmt(new Date()); }
  function nextDay(v) { return fmt(addDays(parse(v), 1)); }
  function countNights(a, b) {
    var s = parse(a), e = parse(b);
    if (!s || !e) return 0;
    return Math.max(0, Math.round((e - s) / 864e5));
  }
  function formatShortDate(v) {
    var d = parse(v);
    return d ? DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] : 'Add date';
  }
  function formatGuests(s) {
    return s.adults + ' adult' + (s.adults === 1 ? '' : 's') +
      (s.children ? ', ' + s.children + ' ' + (s.children === 1 ? 'child' : 'children') : '');
  }
  function buildBookingUrl(s, destination) {
    var p = new URLSearchParams({
      aid: BOOKING_AFFILIATE_ID, label: 'promcoast', ss: destination,
      group_adults: String(s.adults), group_children: String(s.children), no_rooms: String(s.rooms),
      selected_currency: 'AUD', lang: 'en-gb'
    });
    if (s.checkIn) p.set('checkin', s.checkIn);
    if (s.checkOut) p.set('checkout', s.checkOut);
    return 'https://www.booking.com/searchresults.html?' + p.toString();
  }

  /* ---------- shared search state (kept across pages) ---------- */
  var KEY = 'promcoast-search';
  function defaults() {
    var d = new Date();
    var friday = addDays(d, ((5 - d.getDay() + 7) % 7) || 7);
    return { area: 'all', checkIn: fmt(friday), checkOut: fmt(addDays(friday, 2)), adults: 2, children: 0, rooms: 1 };
  }
  var S = defaults();
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved) {
      var base = defaults();
      if (saved.checkIn && saved.checkIn < today()) { delete saved.checkIn; delete saved.checkOut; }
      S = Object.assign(base, saved);
      if (S.area !== 'all' && !getTown(S.area)) S.area = 'all';
    }
  } catch (e) { /* storage unavailable */ }
  var listeners = [];
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  function sync() {
    $$('[data-val]').forEach(function (e) { e.textContent = S[e.dataset.val]; });
    $$('[data-step]').forEach(function (b) {
      var v = S[b.dataset.step];
      b.disabled = +b.dataset.dir < 0 ? v <= +b.dataset.min : v >= +b.dataset.max;
    });
    $$('[data-bind]').forEach(function (i) { if (i.value !== String(S[i.dataset.bind])) i.value = S[i.dataset.bind]; });
    $$('[data-checkout]').forEach(function (i) { i.min = S.checkIn ? nextDay(S.checkIn) : today(); });
    $$('[data-guests]').forEach(function (e) { e.textContent = formatGuests(S); });
    var nights = countNights(S.checkIn, S.checkOut);
    var hs = $('#ho-summary');
    if (hs) hs.textContent = nights > 0 ? nights + ' night' + (nights === 1 ? '' : 's') + ' · ' + formatGuests(S) : 'Choose your dates to see live prices';
    var go = $('#ho-go'); if (go) go.disabled = !(nights > 0);
    save();
    listeners.forEach(function (f) { f(); });
  }

  /* ---------- shared components ---------- */
  var navLinks = [
    ['map.html', 'Explore map', 'map'],
    ['towns.html', 'Towns', 'towns'],
    ['things-to-do.html', 'Things to do', 'things'],
    ['stay.html', 'Stay', 'stay']
  ];

  function headerHTML(page) {
    var desk = navLinks.map(function (l) {
      var on = l[2] === page;
      return '<a href="' + l[0] + '"' + (on ? ' aria-current="page"' : '') + ' class="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ' +
        (on ? 'bg-sand text-ink' : 'text-muted hover:text-ink') + '">' + l[1] + '</a>';
    }).join('');
    var mob = navLinks.map(function (l) {
      return '<li><a href="' + l[0] + '" class="block py-3 font-serif text-2xl">' + l[1] + '</a></li>';
    }).join('');
    return '<header class="sticky top-0 z-50 border-b border-line bg-shell/95 backdrop-blur">' +
      '<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">' +
      '<a href="index.html" class="flex items-baseline gap-2" aria-label="Prom Coast home">' +
      '<span class="font-serif text-2xl font-medium tracking-tight">Prom Coast</span>' +
      '<span class="hidden text-xs text-muted sm:inline">South Gippsland</span></a>' +
      '<nav aria-label="Main" class="hidden items-center gap-1 md:flex">' + desk +
      '<a href="stay.html" class="ml-3 whitespace-nowrap rounded-full bg-ocean px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-ocean-dark">Find a stay</a></nav>' +
      '<button type="button" id="menu-btn" class="-mr-2 rounded-full p-2 md:hidden" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">' +
      '<span data-open>' + icon('menu', 'h-6 w-6') + '</span><span data-close class="hidden">' + icon('x', 'h-6 w-6') + '</span></button></div>' +
      '<nav id="mobile-nav" aria-label="Mobile" class="hidden border-t border-line bg-shell px-6 py-4 md:hidden"><ul class="flex flex-col">' + mob + '</ul>' +
      '<a href="stay.html" class="mt-4 block rounded-full bg-ocean py-3 text-center font-medium text-white">Find a stay</a></nav></header>';
  }

  function footerHTML() {
    var tl = towns.slice(0, 8).map(function (t) {
      return '<li><a class="hover:text-white" href="towns.html#' + t.slug + '">' + t.name + '</a></li>';
    }).join('');
    return '<footer class="bg-ink text-white/75">' +
      '<div class="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-12">' +
      '<div class="md:col-span-5"><p class="font-serif text-3xl text-white">Prom Coast</p>' +
      '<p class="mt-3 max-w-sm text-sm leading-relaxed">An independent guide to South Gippsland, Victoria — beaches, walks, food and places to stay from Venus Bay to Wilsons Promontory.</p>' +
      '<a href="mailto:hello@promcoast.com.au" class="mt-6 inline-block text-sm font-medium text-white underline-offset-4 hover:underline">hello@promcoast.com.au</a></div>' +
      '<nav aria-label="Explore" class="md:col-span-3"><p class="text-sm font-medium text-white">Explore</p>' +
      '<ul class="mt-4 space-y-2.5 text-sm"><li><a class="hover:text-white" href="map.html">Explore map</a></li>' +
      '<li><a class="hover:text-white" href="things-to-do.html">Things to do</a></li>' +
      '<li><a class="hover:text-white" href="towns.html">Towns</a></li>' +
      '<li><a class="hover:text-white" href="stay.html">Find a stay</a></li></ul></nav>' +
      '<nav aria-label="Towns" class="md:col-span-4"><p class="text-sm font-medium text-white">Popular towns</p>' +
      '<ul class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">' + tl + '</ul></nav></div>' +
      '<div class="border-t border-white/10"><div class="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs text-white/60 md:flex-row md:justify-between">' +
      '<p>© ' + new Date().getFullYear() + ' promcoast.com.au</p>' +
      '<p>Accommodation bookings are handled securely by our partner Booking.com. We may earn a commission at no extra cost to you.</p></div></div></footer>';
  }

  var STEP_BTN = 'flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line';
  function stepper(field, label, hint, min, max) {
    return '<div class="flex items-center justify-between py-2.5"><div><p class="text-sm font-medium">' + label + '</p>' +
      (hint ? '<p class="text-xs text-muted">' + hint + '</p>' : '') + '</div>' +
      '<div class="flex items-center gap-3">' +
      '<button type="button" class="' + STEP_BTN + '" data-step="' + field + '" data-dir="-1" data-min="' + min + '" data-max="' + max + '" aria-label="Fewer ' + label.toLowerCase() + '">' + icon('minus', 'h-3.5 w-3.5') + '</button>' +
      '<span class="w-5 text-center text-sm tabular-nums" aria-live="polite" data-val="' + field + '"></span>' +
      '<button type="button" class="' + STEP_BTN + '" data-step="' + field + '" data-dir="1" data-min="' + min + '" data-max="' + max + '" aria-label="More ' + label.toLowerCase() + '">' + icon('plus', 'h-3.5 w-3.5') + '</button>' +
      '</div></div>';
  }

  function searchFormHTML(variant) {
    var cell = 'flex flex-col justify-center rounded-xl px-4 py-2.5 transition-colors duration-150 hover:bg-sand';
    var label = 'text-xs font-medium text-muted';
    var input = 'w-full bg-transparent text-[15px] font-medium text-ink outline-none';
    var opts = '<option value="all">Anywhere on the Prom Coast</option>' +
      towns.map(function (t) { return '<option value="' + t.slug + '">' + t.name + '</option>'; }).join('');
    return '<form data-search-form aria-label="Search accommodation" class="grid gap-1 rounded-2xl bg-white p-2 md:grid-cols-[1.5fr_1fr_1fr_1.1fr_auto] md:gap-0 ' +
      (variant === 'hero' ? 'shadow-xl shadow-ink/10' : 'border border-line') + '">' +
      '<label class="' + cell + '"><span class="' + label + '">Where</span>' +
      '<select class="' + input + ' cursor-pointer appearance-none" data-bind="area">' + opts + '</select></label>' +
      '<label class="' + cell + ' md:border-l md:border-line md:rounded-none"><span class="' + label + '">Check in</span>' +
      '<input type="date" class="' + input + '" min="' + today() + '" data-bind="checkIn" /></label>' +
      '<label class="' + cell + ' md:border-l md:border-line md:rounded-none"><span class="' + label + '">Check out</span>' +
      '<input type="date" class="' + input + '" data-checkout data-bind="checkOut" /></label>' +
      '<div class="relative md:border-l md:border-line">' +
      '<button type="button" class="' + cell + ' w-full text-left" data-guests-toggle aria-expanded="false" aria-haspopup="dialog">' +
      '<span class="' + label + '">Guests</span>' +
      '<span class="flex items-center justify-between gap-2 text-[15px] font-medium"><span class="truncate" data-guests></span>' + icon('chevron-down', 'h-4 w-4 shrink-0 text-muted') + '</span></button>' +
      '<div role="dialog" aria-label="Choose guests" data-guests-pop class="anim-menu absolute right-0 top-full z-30 mt-2 hidden w-72 origin-top-right rounded-2xl border border-line bg-white p-4 shadow-xl shadow-ink/10">' +
      stepper('adults', 'Adults', '', 1, 16) + stepper('children', 'Children', 'Ages 0–17', 0, 10) + stepper('rooms', 'Rooms', '', 1, 8) + '</div></div>' +
      '<button type="submit" class="mt-1 flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-coral px-6 font-medium text-white transition-colors duration-150 hover:bg-coral-dark md:ml-2 md:mt-0">' +
      icon('search', 'h-4 w-4') + 'Search stays</button></form>';
  }

  function stayCardHTML(stay) {
    var town = getTown(stay.townSlug);
    var tn = town ? town.name : 'South Gippsland';
    return '<article class="group flex flex-col">' +
      '<button type="button" data-stay="' + stay.id + '" class="relative block aspect-[4/3] overflow-hidden rounded-2xl" aria-label="Check availability at ' + esc(stay.name) + '">' +
      '<img src="' + stay.image + '" alt="' + esc(stay.name) + ' in ' + esc(tn) + '" loading="lazy" class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" /></button>' +
      '<div class="flex flex-1 flex-col pt-4"><div class="flex items-center justify-between gap-3 text-sm text-muted">' +
      '<span>' + stay.type + ' · ' + (town ? town.name : '') + '</span>' +
      '<span class="flex items-center gap-1 text-ink">' + icon('star', 'h-3.5 w-3.5 fill-current') + stay.rating.toFixed(1) + '<span class="text-muted">(' + stay.reviews + ')</span></span></div>' +
      '<h3 class="mt-1 font-serif text-2xl leading-snug">' + stay.name + '</h3>' +
      '<p class="mt-1 text-sm text-muted">' + stay.highlights.join(' · ') + '</p>' +
      '<div class="mt-auto pt-5"><div class="flex items-center justify-between gap-3 border-t border-line pt-4">' +
      '<p class="text-sm"><span class="text-muted">from </span><span class="text-lg font-semibold">$' + stay.priceFrom + '</span><span class="text-muted"> / night</span></p>' +
      '<button type="button" data-stay="' + stay.id + '" class="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-ocean">Check availability</button>' +
      '</div></div></div></article>';
  }

  /* ---------- booking hand-off dialog ---------- */
  var handoffStay = null;
  var lastFocus = null;
  function openHandoff(stay) {
    handoffStay = stay || null;
    var town = stay ? getTown(stay.townSlug) : null;
    var ov = $('#handoff');
    var inputCls = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-ocean';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="handoff-title" class="anim-pop max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-shell sm:rounded-3xl">' +
      '<div class="flex items-start justify-between gap-4 p-6 pb-0"><div><p class="text-sm text-muted">Your stay</p>' +
      '<h2 id="handoff-title" class="font-serif text-3xl leading-tight">' + (stay ? stay.name : 'Stays in ' + getAreaLabel(S.area)) + '</h2>' +
      (stay ? '<p class="mt-1 text-sm text-muted">' + stay.type + ' · ' + (town ? town.name : '') + ' · Sleeps ' + stay.sleeps + '</p>' : '') + '</div>' +
      '<button type="button" data-close-handoff aria-label="Close" class="rounded-full p-2 text-muted transition-colors duration-150 hover:bg-sand hover:text-ink">' + icon('x', 'h-5 w-5') + '</button></div>' +
      (stay ? '<img src="' + stay.image + '" alt="" class="mx-6 mt-5 h-40 w-[calc(100%-3rem)] rounded-2xl object-cover" />' : '') +
      '<div class="mx-6 mt-5 rounded-2xl border border-line bg-white p-4"><div class="grid grid-cols-2 gap-3">' +
      '<label class="text-xs font-medium text-muted">Check in<input type="date" class="' + inputCls + '" min="' + today() + '" data-bind="checkIn" /></label>' +
      '<label class="text-xs font-medium text-muted">Check out<input type="date" class="' + inputCls + '" data-checkout data-bind="checkOut" /></label></div>' +
      '<div class="mt-3 border-t border-line pt-1">' + stepper('adults', 'Adults', '', 1, 16) + stepper('children', 'Children', 'Ages 0–17', 0, 10) + '</div></div>' +
      '<div class="flex items-baseline justify-between px-6 pt-5"><p class="text-sm text-muted" id="ho-summary"></p>' +
      (stay ? '<p class="text-sm">from <span class="font-semibold">$' + stay.priceFrom + '</span><span class="text-muted"> / night</span></p>' : '') + '</div>' +
      '<div class="px-6 pb-6 pt-4"><button type="button" id="ho-go" class="flex w-full items-center justify-center gap-2 rounded-xl bg-coral py-3.5 font-medium text-white transition-colors duration-150 hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50">Check live availability' + icon('arrow-up-right', 'h-4 w-4') + '</button>' +
      '<ul class="mt-5 space-y-2.5 text-sm text-muted">' +
      '<li class="flex items-center gap-2.5">' + icon('badge-check', 'h-4 w-4 shrink-0 text-ocean') + 'Live prices and availability for your dates</li>' +
      '<li class="flex items-center gap-2.5">' + icon('refresh-ccw', 'h-4 w-4 shrink-0 text-ocean') + 'Many stays offer free cancellation</li>' +
      '<li class="flex items-center gap-2.5">' + icon('lock', 'h-4 w-4 shrink-0 text-ocean') + 'Secure payment with our booking partner, Booking.com</li></ul>' +
      '<p class="mt-5 text-xs leading-relaxed text-muted">Opens in a new tab so you can keep exploring. Prom Coast may earn a commission at no extra cost to you.</p></div></div>';
    lastFocus = document.activeElement;
    ov.classList.remove('hidden'); ov.classList.add('flex', 'anim-fade');
    document.body.style.overflow = 'hidden';
    sync();
    var cb = $('[data-close-handoff]', ov); if (cb) cb.focus();
  }
  function closeHandoff() {
    var ov = $('#handoff');
    if (ov.classList.contains('hidden')) return;
    ov.classList.add('hidden'); ov.classList.remove('flex', 'anim-fade');
    ov.innerHTML = '';
    document.body.style.overflow = '';
    handoffStay = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function continueBooking() {
    var t = handoffStay ? getTown(handoffStay.townSlug) : null;
    var dest = handoffStay ? handoffStay.name + ', ' + (t ? t.name : '') + ', Victoria, Australia' : getAreaDestination(S.area);
    window.open(buildBookingUrl(S, dest), '_blank', 'noopener,noreferrer');
    closeHandoff();
  }

  /* ---------- explore map (Leaflet) ---------- */
  var CENTER = [-38.8, 146.08];
  function mapCardHTML(point) {
    var town = getTown(point.townSlug);
    var cat = categories.find(function (c) { return c.id === point.category; });
    var stay = point.stayId ? stays.find(function (s) { return s.id === point.stayId; }) : null;
    var primary = 'whitespace-nowrap rounded-full bg-coral px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-coral-dark';
    var secondary = 'whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors duration-150 hover:border-ink';
    var actions = '';
    if (stay) actions += '<button type="button" class="' + primary + '" data-stay="' + stay.id + '">Check availability</button>';
    if (point.category === 'town') {
      actions += '<button type="button" class="' + primary + '" data-area-go="' + point.townSlug + '">Stays in ' + point.name + '</button>' +
        '<a href="towns.html#' + point.townSlug + '" class="' + secondary + '">Town guide</a>';
    }
    if (!stay && point.category !== 'town' && town) actions += '<button type="button" class="' + primary + '" data-area-go="' + town.slug + '">Stay near ' + town.name + '</button>';
    return '<div class="anim-card overflow-hidden rounded-2xl bg-white shadow-xl shadow-ink/15">' +
      (point.image ? '<img src="' + point.image + '" alt="" class="h-32 w-full object-cover" />' : '') +
      '<div class="p-5"><div class="flex items-start justify-between gap-3"><div>' +
      '<p class="flex items-center gap-2 text-xs font-medium text-muted"><span class="h-2 w-2 rounded-full" style="background:' + (cat ? cat.color : '#13303a') + '"></span>' +
      (cat ? cat.label : '') + (point.category !== 'town' && town ? ' · ' + town.name : '') + '</p>' +
      '<h3 class="mt-1 font-serif text-2xl leading-tight">' + point.name + '</h3></div>' +
      '<button type="button" data-card-close aria-label="Close details" class="-mr-2 -mt-1 rounded-full p-1.5 text-muted transition-colors duration-150 hover:bg-sand hover:text-ink">' + icon('x', 'h-4 w-4') + '</button></div>' +
      '<p class="mt-1 text-sm text-muted">' + point.subtitle + '</p>' +
      '<p class="mt-3 text-sm leading-relaxed">' + point.blurb + '</p>' +
      '<div class="mt-4 flex flex-wrap gap-2">' + actions + '</div></div></div>';
  }

  function exploreMap(root, opts) {
    var compact = opts.variant === 'compact';
    var all = buildMapPoints();
    var filters = [{ id: 'all', label: 'All' }].concat(categories.map(function (c) { return { id: c.id, label: c.label }; }));
    var filter = opts.category || 'all', query = '', selId = opts.focus || null;

    var mapBlock =
      '<div class="relative isolate h-full w-full"><div data-map class="h-full w-full"></div>' +
      (compact ? '<div class="absolute left-4 right-4 top-4 z-[1001]" data-chips></div>' : '') +
      '<div class="pointer-events-none absolute left-4 right-4 z-[1001] sm:right-auto sm:w-[360px] ' + (compact ? 'top-[4.5rem]' : 'bottom-4') + '"><div class="pointer-events-auto" data-card></div></div></div>';

    if (compact) {
      root.innerHTML = mapBlock;
    } else {
      root.innerHTML =
        '<div class="flex h-full flex-col lg:flex-row">' +
        '<aside class="order-2 flex w-full flex-col border-line bg-shell lg:order-1 lg:h-full lg:min-h-0 lg:w-[400px] lg:border-r">' +
        '<div class="space-y-4 border-b border-line p-6">' + (opts.header || '') +
        '<label class="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 focus-within:border-ocean">' + icon('search', 'h-4 w-4 text-muted') +
        '<span class="sr-only">Search places</span><input type="search" data-q placeholder="Search beaches, towns, walks…" class="w-full bg-transparent text-sm outline-none placeholder:text-muted" /></label>' +
        '<div data-chips></div></div>' +
        '<p class="px-6 pt-4 text-xs font-medium text-muted" aria-live="polite" data-count></p>' +
        '<ul class="divide-y divide-line lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-list></ul></aside>' +
        '<div class="order-1 h-[60vh] flex-1 lg:order-2 lg:h-full">' + mapBlock + '</div></div>';
    }

    var map = L.map($('[data-map]', root), { center: CENTER, zoom: compact ? 9 : 10, scrollWheelZoom: !compact, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    /* Map tiles: no API key needed. Primary = Esri World Street Map; if it keeps failing, falls back to OpenStreetMap. */
    var TILES = {
      esri: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', maxZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, OpenStreetMap contributors' },
      osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
    };
    var tiles = L.tileLayer(TILES.esri.url, { maxZoom: TILES.esri.maxZoom, attribution: TILES.esri.attribution }).addTo(map);
    var tileErrors = 0, usingFallback = false;
    tiles.on('tileerror', function () {
      if (usingFallback || ++tileErrors < 4) return;
      usingFallback = true;
      map.removeLayer(tiles);
      L.tileLayer(TILES.osm.url, { maxZoom: TILES.osm.maxZoom, attribution: TILES.osm.attribution }).addTo(map);
    });
    var layer = L.layerGroup().addTo(map);

    function visible() {
      var q = query.trim().toLowerCase();
      return all.filter(function (p) {
        return (filter === 'all' || p.category === filter) && (!q || (p.name + ' ' + p.subtitle).toLowerCase().indexOf(q) !== -1);
      });
    }
    function icn(p, selected) {
      var cls = selected ? ' is-selected' : '';
      if (p.category === 'town') return L.divIcon({ className: 'pc-marker', iconSize: [0, 0], html: '<div class="pc-town' + cls + '">' + p.name + '</div>' });
      return L.divIcon({ className: 'pc-marker', iconSize: [0, 0], html: '<div class="pc-pin' + cls + '" style="background:' + catColor(p.category) + '"></div>' });
    }
    function renderChips() {
      $('[data-chips]', root).innerHTML = '<div class="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">' +
        filters.map(function (f) {
          var on = filter === f.id;
          return '<button type="button" data-filter="' + f.id + '" aria-pressed="' + on + '" class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ' +
            (on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink') + '">' +
            (f.id !== 'all' ? '<span class="h-2 w-2 rounded-full" style="background:' + catColor(f.id) + '"></span>' : '') + f.label + '</button>';
        }).join('') + '</div>';
    }
    function renderMarkers(vis) {
      layer.clearLayers();
      vis.forEach(function (p) {
        var sel = p.id === selId;
        L.marker([p.lat, p.lng], {
          icon: icn(p, sel), title: p.name, keyboard: true,
          zIndexOffset: sel ? 1000 : p.category === 'town' ? 500 : 0
        }).on('click', function () { select(p.id); }).addTo(layer);
      });
    }
    function renderList(vis) {
      if (compact) return;
      $('[data-count]', root).textContent = vis.length + ' ' + (vis.length === 1 ? 'place' : 'places');
      $('[data-list]', root).innerHTML = vis.map(function (p) {
        var on = p.id === selId;
        return '<li><button type="button" data-pick="' + p.id + '"' + (on ? ' aria-current="true"' : '') + ' class="flex w-full items-start gap-3 px-6 py-3.5 text-left transition-colors duration-150 ' + (on ? 'bg-ocean-light' : 'hover:bg-sand') + '">' +
          '<span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background:' + catColor(p.category) + '">' + catIcon(p.category, 'h-4 w-4') + '</span>' +
          '<span class="min-w-0"><span class="block font-medium">' + p.name + '</span><span class="block truncate text-sm text-muted">' + p.subtitle + '</span></span></button></li>';
      }).join('') + (vis.length === 0 ? '<li class="px-6 py-10 text-center text-sm text-muted">Nothing matches “' + esc(query) + '”. Try a town name or clear the filter.</li>' : '');
    }
    function renderCard() {
      var p = all.find(function (x) { return x.id === selId; });
      $('[data-card]', root).innerHTML = p ? mapCardHTML(p) : '';
    }
    function renderAll() {
      var vis = visible();
      renderChips(); renderMarkers(vis); renderList(vis); renderCard();
    }
    function select(id) {
      selId = id;
      renderAll();
      var p = all.find(function (x) { return x.id === id; });
      if (p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 12), { duration: 0.5 });
      if (compact && p) root.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // keep map + card in view on the home page
    }

    root.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { filter = f.dataset.filter; renderAll(); return; }
      var pk = e.target.closest('[data-pick]');
      if (pk) { select(pk.dataset.pick); return; }
      if (e.target.closest('[data-card-close]')) { selId = null; renderAll(); }
    });
    var qi = $('[data-q]', root);
    if (qi) qi.addEventListener('input', function () { query = qi.value; renderAll(); });

    renderAll();
    setTimeout(function () { map.invalidateSize(); }, 0);
    if (selId) {
      var p0 = all.find(function (x) { return x.id === selId; });
      if (p0) map.flyTo([p0.lat, p0.lng], Math.max(map.getZoom(), 12), { duration: 0.5 });
    }
  }

  /* ---------- pages ---------- */
  var LINK = 'inline-flex items-center gap-2 whitespace-nowrap font-medium text-ocean hover:text-ocean-dark';
  var HERO = 'images/92dae45c-eb11-42af-a973-ed60e2addf68.jpg';

  function renderHome(main) {
    var act = categories.filter(function (c) { return c.id !== 'stay' && c.id !== 'town'; });
    var featured = towns.filter(function (t) { return t.featured; });
    main.innerHTML =
      '<section class="relative"><div class="relative h-[76vh] max-h-[820px] min-h-[560px]">' +
      '<img src="' + HERO + '" alt="Turquoise bay, white sand and granite boulders at Wilsons Promontory" class="absolute inset-0 h-full w-full object-cover" />' +
      '<div class="absolute inset-0 bg-black/35"></div>' +
      '<div class="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-36 md:pb-40">' +
      '<h1 class="max-w-3xl font-serif text-5xl leading-[1.02] text-white md:text-7xl">Start your story on the Prom Coast</h1>' +
      '<p class="mt-5 max-w-xl text-lg text-white/90">Wild beaches, granite headlands and rolling green hills — South Gippsland is just two hours from Melbourne.</p></div></div>' +
      '<div class="relative z-10 mx-auto -mt-20 max-w-6xl px-6">' + searchFormHTML('hero') + '</div></section>' +

      '<section class="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-12"><div class="lg:col-span-5">' +
      '<h2 class="font-serif text-4xl leading-tight md:text-5xl">Where history meets breathtaking beauty</h2>' +
      '<p class="mt-6 text-lg leading-relaxed text-muted">Step onto a coast steeped in maritime history and wild charm. Untamed ocean swells, rolling green hills and dramatic headlands — all easily reached from Melbourne — make the Prom Coast the perfect place to lose yourself.</p></div>' +
      '<nav aria-label="Things to do" class="lg:col-span-6 lg:col-start-7"><ul class="border-b border-line">' +
      act.map(function (c) {
        var n = places.filter(function (p) { return p.category === c.id; }).length;
        return '<li class="border-t border-line"><a href="things-to-do.html?category=' + c.id + '" class="group flex items-center gap-6 py-6"><span class="flex-1">' +
          '<span class="flex items-baseline gap-3"><span class="font-serif text-3xl">' + c.label + '</span><span class="text-sm text-muted">' + n + ' places</span></span>' +
          '<span class="mt-1 block text-muted">' + c.description + '</span></span>' +
          icon('arrow-right', 'h-5 w-5 shrink-0 text-muted transition-transform duration-200 ease-out group-hover:translate-x-1 group-hover:text-ink') + '</a></li>';
      }).join('') + '</ul></nav></section>' +

      '<section class="bg-sand py-20"><div class="mx-auto max-w-7xl px-6"><div class="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div>' +
      '<h2 class="font-serif text-4xl md:text-5xl">The whole coast on one map</h2>' +
      '<p class="mt-3 max-w-xl text-muted">Tap a beach, walk or town to see what\'s there — then find a stay nearby.</p></div>' +
      '<a href="map.html" class="' + LINK + '">Open the full map ' + icon('arrow-right', 'h-4 w-4') + '</a></div>' +
      '<div id="home-map" class="mt-10 h-[540px] overflow-hidden rounded-3xl border border-line"></div></div></section>' +

      '<section class="mx-auto max-w-7xl px-6 py-24"><div class="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div>' +
      '<h2 class="font-serif text-4xl md:text-5xl">Pick your base</h2>' +
      '<p class="mt-3 max-w-xl text-muted">From the Prom\'s only settlement to arty villages and surf towns.</p></div>' +
      '<a href="towns.html" class="' + LINK + '">All ' + towns.length + ' towns ' + icon('arrow-right', 'h-4 w-4') + '</a></div>' +
      '<div class="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">' +
      featured.map(function (t, i) {
        return '<a href="towns.html#' + t.slug + '" class="group relative block min-h-[260px] overflow-hidden rounded-3xl ' + (i === 0 ? 'md:col-span-2 lg:row-span-2 lg:min-h-[560px]' : '') + '">' +
          '<img src="' + t.image + '" alt="" class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />' +
          '<div class="absolute inset-0 bg-black/30"></div><div class="absolute inset-x-0 bottom-0 p-6 text-white">' +
          '<p class="text-sm text-white/85">' + t.tagline + ' · ' + t.drive + ' from Melbourne</p>' +
          '<h3 class="font-serif leading-tight ' + (i === 0 ? 'text-5xl' : 'text-3xl') + '">' + t.name + '</h3></div></a>';
      }).join('') + '</div></section>' +

      '<section class="border-t border-line py-24"><div class="mx-auto max-w-7xl px-6"><div class="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div>' +
      '<h2 class="font-serif text-4xl md:text-5xl">Hand-picked places to stay</h2>' +
      '<p class="mt-3 max-w-xl text-muted">Chosen for location and character. Check live prices for your dates in a click.</p></div>' +
      '<a href="stay.html" class="' + LINK + '">See all stays ' + icon('arrow-right', 'h-4 w-4') + '</a></div>' +
      '<div class="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">' + stays.slice(0, 3).map(stayCardHTML).join('') + '</div></div></section>' +

      '<section class="bg-ocean"><div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-20 md:flex-row md:items-center"><div>' +
      '<h2 class="font-serif text-4xl text-white md:text-5xl">Your weekend starts here.</h2>' +
      '<p class="mt-3 max-w-lg text-white/80">Tell us when you\'re coming and we\'ll show you the best places to stay along the coast.</p></div>' +
      '<div class="flex flex-wrap gap-3"><a href="stay.html" class="whitespace-nowrap rounded-full bg-white px-6 py-3 font-medium text-ink transition-colors duration-150 hover:bg-sand">Find a stay</a>' +
      '<a href="map.html" class="whitespace-nowrap rounded-full border border-white/40 px-6 py-3 font-medium text-white transition-colors duration-150 hover:border-white">Explore the map</a></div></div></section>';
    exploreMap($('#home-map'), { variant: 'compact' });
  }

  function renderTowns(main) {
    main.innerHTML =
      '<div class="w-full"><header class="mx-auto max-w-7xl px-6 pb-10 pt-16"><h1 class="font-serif text-5xl md:text-6xl">Prom Coast towns</h1>' +
      '<p class="mt-4 max-w-2xl text-lg text-muted">Twelve places to call home for a weekend or a week — each with its own beach, bakery or back road worth knowing about.</p>' +
      '<nav aria-label="Jump to town" class="mt-8 flex flex-wrap gap-2">' +
      towns.map(function (t) { return '<a href="#' + t.slug + '" class="whitespace-nowrap rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 hover:border-ink">' + t.name + '</a>'; }).join('') +
      '</nav></header><div class="mx-auto max-w-7xl px-6 pb-24">' +
      towns.map(function (t) {
        return '<article id="' + t.slug + '" class="grid scroll-mt-24 gap-8 border-t border-line py-12 md:grid-cols-12">' +
          '<img src="' + t.image + '" alt="' + esc(t.name) + ', South Gippsland" loading="lazy" class="aspect-[4/3] w-full rounded-2xl object-cover md:col-span-5" />' +
          '<div class="flex flex-col md:col-span-6 md:col-start-7"><p class="flex items-center gap-2 text-sm text-muted">' + icon('car', 'h-4 w-4') + t.drive + ' from Melbourne</p>' +
          '<h2 class="mt-2 font-serif text-4xl">' + t.name + '</h2><p class="mt-1 text-lg text-ocean">' + t.tagline + '</p>' +
          '<p class="mt-4 leading-relaxed text-muted">' + t.description + '</p>' +
          '<p class="mt-4 text-sm"><span class="font-medium">Don\'t miss: </span><span class="text-muted">' + t.highlights.join(' · ') + '</span></p>' +
          '<div class="mt-auto flex flex-wrap gap-3 pt-6"><button type="button" data-area-go="' + t.slug + '" class="whitespace-nowrap rounded-full bg-coral px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-coral-dark">Stays in ' + t.name + '</button>' +
          '<a href="map.html?focus=town-' + t.slug + '" class="whitespace-nowrap rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors duration-150 hover:border-ink">See on map</a></div></div></article>';
      }).join('') + '</div></div>';
  }

  function renderThings(main) {
    var tabs = [{ id: 'all', label: 'Everything' }].concat(categories.filter(function (c) { return c.id !== 'stay' && c.id !== 'town'; })
      .map(function (c) { return { id: c.id, label: c.label }; }));
    var param = new URLSearchParams(location.search).get('category');
    var active = tabs.some(function (t) { return t.id === param; }) ? param : 'all';
    var shown = active === 'all' ? places : places.filter(function (p) { return p.category === active; });
    main.innerHTML =
      '<div class="w-full"><header class="mx-auto max-w-7xl px-6 pb-8 pt-16"><h1 class="font-serif text-5xl md:text-6xl">Things to do</h1>' +
      '<p class="mt-4 max-w-2xl text-lg text-muted">Beaches, walks, cellar doors and a little history — found and checked by locals.</p></header>' +
      '<div class="sticky top-16 z-20 border-b border-line bg-shell/95 backdrop-blur"><div role="tablist" aria-label="Category" class="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-6">' +
      tabs.map(function (t) {
        return '<button role="tab" data-tab="' + t.id + '" aria-selected="' + (active === t.id) + '" class="whitespace-nowrap border-b-2 py-4 text-sm font-medium transition-colors duration-150 ' +
          (active === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink') + '">' + t.label + '</button>';
      }).join('') + '</div></div>' +
      '<div class="mx-auto grid max-w-7xl gap-x-16 px-6 pb-24 pt-4 lg:grid-cols-2">' +
      shown.map(function (p) {
        var t = getTown(p.townSlug);
        return '<article class="flex gap-5 border-b border-line py-7">' +
          (p.image ? '<img src="' + p.image + '" alt="" loading="lazy" class="h-24 w-24 shrink-0 rounded-xl object-cover md:h-28 md:w-28" />' :
            '<div class="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl text-white md:h-28 md:w-28" style="background:' + catColor(p.category) + '">' + catIcon(p.category, 'h-7 w-7') + '</div>') +
          '<div class="flex min-w-0 flex-1 flex-col"><p class="text-sm text-muted">' + p.detail + '</p>' +
          '<h2 class="mt-0.5 font-serif text-2xl leading-snug">' + p.name + '</h2><p class="mt-1.5 text-sm leading-relaxed text-muted">' + p.blurb + '</p>' +
          '<div class="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-4 text-sm font-medium">' +
          '<a href="map.html?focus=' + p.id + '" class="inline-flex items-center gap-1.5 text-ocean hover:text-ocean-dark">' + icon('map-pin', 'h-4 w-4') + 'Show on map</a>' +
          (t ? '<button type="button" data-area-go="' + t.slug + '" class="text-coral hover:text-coral-dark">Stays near ' + t.name + '</button>' : '') +
          '</div></div></article>';
      }).join('') + '</div></div>';
  }

  var stayType = 'all';
  var STAY_TYPES = ['Cottage', 'Beach house', 'Cabin', 'Farm stay', 'Glamping', 'Motel'];
  function renderStayResults() {
    var box = $('#stay-results'); if (!box) return;
    var focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.type : null;
    var shown = stays.filter(function (s) { return (S.area === 'all' || s.townSlug === S.area) && (stayType === 'all' || s.type === stayType); });
    var areaLabel = getAreaLabel(S.area);
    var nights = countNights(S.checkIn, S.checkOut);
    var dates = nights > 0 ? formatShortDate(S.checkIn) + ' – ' + formatShortDate(S.checkOut) + ' · ' + nights + ' night' + (nights === 1 ? '' : 's') : 'Add dates to check live prices';
    var btn = 'whitespace-nowrap rounded-full bg-coral px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-coral-dark';
    box.innerHTML =
      '<div class="flex flex-col gap-6 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between"><div>' +
      '<h2 class="font-serif text-3xl">' + shown.length + ' hand-picked ' + (shown.length === 1 ? 'stay' : 'stays') + ' in ' + areaLabel + '</h2>' +
      '<p class="mt-1 text-sm text-muted">' + dates + (S.area !== 'all' ? ' · <button type="button" data-reset-area class="font-medium text-ocean hover:text-ocean-dark">Show whole coast</button>' : '') + '</p></div>' +
      '<button type="button" data-handoff-any class="inline-flex items-center gap-1.5 self-start whitespace-nowrap text-sm font-medium text-coral hover:text-coral-dark lg:self-auto">Search every available stay in ' + areaLabel + icon('arrow-up-right', 'h-4 w-4') + '</button></div>' +
      '<div class="mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Type of stay">' +
      ['all'].concat(STAY_TYPES).map(function (t) {
        return '<button type="button" data-type="' + t + '" aria-pressed="' + (stayType === t) + '" class="shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ' +
          (stayType === t ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink') + '">' + (t === 'all' ? 'All types' : t) + '</button>';
      }).join('') + '</div>' +
      (shown.length > 0 ?
        '<div class="mt-10 grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">' + shown.map(stayCardHTML).join('') + '</div>' :
        '<div class="mt-10 rounded-3xl bg-sand px-8 py-16 text-center"><h3 class="font-serif text-3xl">No hand-picked stays here yet</h3>' +
        '<p class="mx-auto mt-3 max-w-md text-muted">We haven\'t reviewed a ' + (stayType === 'all' ? 'stay' : stayType.toLowerCase()) + ' in ' + areaLabel + ' yet, but there\'s plenty available. Search live availability or widen your search.</p>' +
        '<div class="mt-6 flex flex-wrap justify-center gap-3"><button type="button" data-handoff-any class="' + btn + '">Search live availability</button>' +
        '<button type="button" data-reset-all class="whitespace-nowrap rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium transition-colors duration-150 hover:border-ink">Show the whole coast</button></div></div>');
    if (focused) { var f = $('[data-type="' + focused + '"]', box); if (f) f.focus(); }
  }

  function renderStay(main) {
    var steps = [
      ['Tell us your dates', 'Your dates and guests follow you around the site.'],
      ['Pick a stay you love', 'Browse hand-picked places or search the whole coast.'],
      ['Confirm securely', 'Live prices and secure payment through Booking.com.']
    ];
    main.innerHTML =
      '<div class="w-full"><section class="bg-ocean"><div class="mx-auto max-w-7xl px-6 pb-12 pt-16"><h1 class="font-serif text-5xl text-white md:text-6xl">Find your stay</h1>' +
      '<p class="mt-4 max-w-2xl text-lg text-white/85">Cottages, beach houses and farm stays across South Gippsland — with live prices and secure booking through our partner, Booking.com.</p>' +
      '<div class="mt-8">' + searchFormHTML('bar') + '</div></div></section>' +
      '<section class="mx-auto max-w-7xl px-6 py-12" id="stay-results"></section>' +
      '<section class="border-t border-line bg-sand"><div class="mx-auto max-w-7xl px-6 py-16"><h2 class="font-serif text-3xl">How booking works</h2>' +
      '<ol class="mt-8 grid gap-10 md:grid-cols-3">' +
      steps.map(function (s, i) {
        return '<li class="flex gap-4"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">' + (i + 1) + '</span>' +
          '<div><h3 class="font-medium">' + s[0] + '</h3><p class="mt-1 text-sm text-muted">' + s[1] + '</p></div></li>';
      }).join('') + '</ol></div></section></div>';
    listeners.push(renderStayResults);
    renderStayResults();
  }

  function renderMap(main) {
    var params = new URLSearchParams(location.search);
    var cat = params.get('category');
    var category = categories.some(function (c) { return c.id === cat; }) ? cat : 'all';
    main.innerHTML = '<div id="map-root" class="w-full lg:h-[calc(100vh-4rem)]"></div>';
    exploreMap($('#map-root'), {
      variant: 'full', focus: params.get('focus'), category: category,
      header: '<div><h1 class="font-serif text-4xl">Explore the Prom Coast</h1><p class="mt-2 text-sm text-muted">Beaches, walks, food and places to stay. Tap any pin to learn more.</p></div>'
    });
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var st = t.closest('[data-stay]');
    if (st) { openHandoff(stays.find(function (s) { return s.id === st.dataset.stay; })); return; }
    if (t.closest('[data-handoff-any]')) { openHandoff(); return; }
    var ag = t.closest('[data-area-go]');
    if (ag) { S.area = ag.dataset.areaGo; save(); location.href = 'stay.html'; return; }
    if (t.closest('[data-reset-area]')) { S.area = 'all'; sync(); return; }
    if (t.closest('[data-reset-all]')) { stayType = 'all'; S.area = 'all'; sync(); return; }
    var ty = t.closest('[data-type]');
    if (ty) { stayType = ty.dataset.type; renderStayResults(); return; }
    var sp = t.closest('[data-step]');
    if (sp) {
      var f = sp.dataset.step, v = S[f] + +sp.dataset.dir;
      if (v >= +sp.dataset.min && v <= +sp.dataset.max) { S[f] = v; sync(); }
      return;
    }
    var gt = t.closest('[data-guests-toggle]');
    if (gt) {
      var pop = gt.parentNode.querySelector('[data-guests-pop]');
      var open = pop.classList.contains('hidden');
      pop.classList.toggle('hidden', !open); gt.setAttribute('aria-expanded', String(open));
      return;
    }
    if (t.closest('[data-close-handoff]') || t === $('#handoff')) { closeHandoff(); return; }
    if (t.closest('#ho-go')) { continueBooking(); return; }
    var tab = t.closest('[data-tab]');
    if (tab) {
      var id = tab.dataset.tab;
      history.pushState({}, '', id === 'all' ? location.pathname : location.pathname + '?category=' + id);
      renderThings($('#main')); var nt = $('[data-tab="' + id + '"]'); if (nt) nt.focus();
      return;
    }
    var mb = t.closest('#menu-btn');
    if (mb) {
      var nav = $('#mobile-nav'), open2 = nav.classList.contains('hidden');
      nav.classList.toggle('hidden', !open2); if (open2) nav.classList.add('anim-drop');
      mb.setAttribute('aria-expanded', String(open2)); mb.setAttribute('aria-label', open2 ? 'Close menu' : 'Open menu');
      $('[data-open]', mb).classList.toggle('hidden', open2); $('[data-close]', mb).classList.toggle('hidden', !open2);
    }
  });
  document.addEventListener('mousedown', function (e) {
    $$('[data-guests-pop]').forEach(function (pop) {
      if (!pop.classList.contains('hidden') && !pop.parentNode.contains(e.target)) {
        pop.classList.add('hidden'); pop.parentNode.querySelector('[data-guests-toggle]').setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeHandoff();
    $$('[data-guests-pop]').forEach(function (pop) {
      pop.classList.add('hidden'); pop.parentNode.querySelector('[data-guests-toggle]').setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('change', function (e) {
    var i = e.target.closest ? e.target.closest('[data-bind]') : null;
    if (!i) return;
    var f = i.dataset.bind, v = i.value;
    if (f === 'checkIn') {
      S.checkIn = v;
      if (v && (!S.checkOut || S.checkOut <= v)) S.checkOut = nextDay(v);
    } else S[f] = v;
    sync();
  });
  document.addEventListener('submit', function (e) {
    if (!e.target.matches('[data-search-form]')) return;
    e.preventDefault();
    if (document.getElementById('stay-results')) { sync(); return; }
    save(); location.href = 'stay.html';
  });

  /* ---------- boot ---------- */
  var main = $('#main');
  var page = main.dataset.page;
  $('#site-header').outerHTML = headerHTML(page);
  if (page !== 'map') $('#site-footer').outerHTML = footerHTML(); else $('#site-footer').remove();

  ({ home: renderHome, towns: renderTowns, things: renderThings, stay: renderStay, map: renderMap })[page](main);
  window.addEventListener('popstate', function () { if (page === 'things') renderThings(main); });
  sync();
  if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
})();
