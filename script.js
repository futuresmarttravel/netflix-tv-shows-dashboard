/**
 * ============================================================
 * script.js — TV Show Analytics Dashboard
 * Netflix · Disney+ · Amazon Prime · Hulu
 *
 * Architecture:
 *  1. Data loading & cleaning
 *  2. Filter population & state management
 *  3. KPI computation
 *  4. Chart rendering / updating (Chart.js)
 *  5. Table rendering (Top 10 Longest-Running)
 *  6. Event wiring
 * ============================================================
 */

/* ============================================================
   SECTION 1 — CONSTANTS & COLOUR PALETTE
   ============================================================ */

/** Brand colours — burgundy primary, amber accent */
const COLOR_PRIMARY = '#660033';
const COLOR_ACCENT  = '#F59E0B';

/** Per-platform colours used consistently across all charts */
const PLATFORM_COLORS = {
  'Netflix':      '#660033',   // Burgundy
  'Disney+':      '#1d4ed8',   // Blue
  'Amazon Prime': '#d97706',   // Amber-dark
  'Hulu':         '#059669',   // Emerald
};

/** Fallback colour when platform is unknown */
const COLOR_OTHER = '#6b7280';

/** Ordered list of platforms for consistent chart stacking */
const PLATFORMS = ['Netflix', 'Disney+', 'Amazon Prime', 'Hulu'];

/** Chart.js global defaults */
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#6b7280';


/* ============================================================
   SECTION 2 — DATA LOADING & CLEANING
   ============================================================ */

/** Raw JSON data stored after fetch */
let rawData = [];

/**
 * Extract integer season count from duration field.
 * "4 Seasons" → 4 | "1 Season" → 1 | movies / unparseable → null
 */
function parseSeasons(duration) {
  if (!duration || typeof duration !== 'string') return null;
  const match = duration.match(/^(\d+)\s+Season/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Split a comma-separated string into a cleaned array.
 * Handles empty / null values gracefully.
 * "Drama, Mystery, Sci-Fi" → ["Drama", "Mystery", "Sci-Fi"]
 */
function splitMultiValue(str) {
  if (!str || typeof str !== 'string' || str.trim() === '') return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Extract the 4-digit year from a date string.
 * Accepts ISO "2021-04-23" or any string with a 4-digit year component.
 * Returns null if unparseable.
 */
function parseYear(str) {
  if (!str) return null;
  const match = String(str).match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Clean and normalise a single record from the raw dataset.
 * Returns the enriched record object.
 */
function cleanRecord(record) {
  return {
    platform:     (record.platform || 'Unknown').trim(),
    type:         (record.type     || 'Unknown').trim(),
    title:        (record.title    || 'Unknown').trim(),
    countries:    splitMultiValue(record.country),          // array
    dateAddedYear: parseYear(record.date_added),
    releaseYear:  record.release_year ? parseInt(record.release_year, 10) : null,
    rating:       (record.rating   || '').trim() || 'NR',  // 'NR' = Not Rated
    seasons:      parseSeasons(record.duration),            // null for movies
    genres:       splitMultiValue(record.listed_in),        // array
    rawDuration:  (record.duration || '').trim(),
  };
}

/**
 * Fetch the JSON file, clean all records, and kick off the dashboard.
 */
async function loadData() {
  try {
    const response = await fetch('kaggle_tv_shows.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    rawData = json.map(cleanRecord);
    initFilters();
    renderDashboard();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('record-count').textContent = 'Error loading data';
  }
}


/* ============================================================
   SECTION 3 — FILTER STATE & POPULATION
   ============================================================ */

/** Current filter values */
const filters = {
  platform:  'all',
  yearFrom:  null,
  yearTo:    null,
  rating:    'all',
  genre:     'all',
};

/**
 * Populate all filter <select> dropdowns from rawData unique values.
 */
function initFilters() {
  // Platform
  const platforms = [...new Set(rawData.map(d => d.platform))].sort();
  populateSelect('filter-platform', platforms);

  // Age Rating (sort by common TV rating order then alphabetical)
  const ratingOrder = ['TV-G','TV-Y','TV-Y7','TV-PG','TV-14','TV-MA','G','PG','PG-13','R','NC-17','NR'];
  const ratings = [...new Set(rawData.map(d => d.rating))].sort(
    (a, b) => {
      const ia = ratingOrder.indexOf(a);
      const ib = ratingOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
  );
  populateSelect('filter-rating', ratings);

  // Genres (all unique genres across the multi-value field)
  const genreSet = new Set();
  rawData.forEach(d => d.genres.forEach(g => genreSet.add(g)));
  const genres = [...genreSet].sort();
  populateSelect('filter-genre', genres);

  // Wire up filter events
  document.getElementById('filter-platform').addEventListener('change', onFilterChange);
  document.getElementById('filter-year-from').addEventListener('input', onFilterChange);
  document.getElementById('filter-year-to').addEventListener('input', onFilterChange);
  document.getElementById('filter-rating').addEventListener('change', onFilterChange);
  document.getElementById('filter-genre').addEventListener('change', onFilterChange);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

/**
 * Add <option> elements to a <select> by id.
 * @param {string} selectId
 * @param {string[]} values
 */
function populateSelect(selectId, values) {
  const sel = document.getElementById(selectId);
  values.forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    sel.appendChild(opt);
  });
}

/** Handle any filter change — read current UI state and re-render. */
function onFilterChange() {
  filters.platform = document.getElementById('filter-platform').value;
  filters.yearFrom = parseInt(document.getElementById('filter-year-from').value) || null;
  filters.yearTo   = parseInt(document.getElementById('filter-year-to').value)   || null;
  filters.rating   = document.getElementById('filter-rating').value;
  filters.genre    = document.getElementById('filter-genre').value;
  renderDashboard();
}

/** Reset all filters to defaults and re-render. */
function resetFilters() {
  filters.platform = 'all';
  filters.yearFrom = null;
  filters.yearTo   = null;
  filters.rating   = 'all';
  filters.genre    = 'all';

  document.getElementById('filter-platform').value  = 'all';
  document.getElementById('filter-year-from').value = '';
  document.getElementById('filter-year-to').value   = '';
  document.getElementById('filter-rating').value    = 'all';
  document.getElementById('filter-genre').value     = 'all';

  renderDashboard();
}

/**
 * Apply current filter state to rawData.
 * Returns the filtered array.
 */
function applyFilters() {
  return rawData.filter(d => {
    if (filters.platform !== 'all' && d.platform !== filters.platform) return false;
    if (filters.yearFrom  !== null && (d.releaseYear === null || d.releaseYear < filters.yearFrom)) return false;
    if (filters.yearTo    !== null && (d.releaseYear === null || d.releaseYear > filters.yearTo))   return false;
    if (filters.rating    !== 'all' && d.rating !== filters.rating) return false;
    if (filters.genre     !== 'all' && !d.genres.includes(filters.genre)) return false;
    return true;
  });
}


/* ============================================================
   SECTION 4 — CHART REGISTRY (destroy-then-rebuild pattern)
   ============================================================ */

/** Map of canvas id → Chart.js instance for cleanup */
const chartInstances = {};

/**
 * Destroy an existing chart instance before recreating it.
 * Prevents the "Canvas already in use" error on filter updates.
 */
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

/** Create and register a Chart.js instance. */
function createChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  chartInstances[id] = new Chart(ctx, config);
  return chartInstances[id];
}


/* ============================================================
   SECTION 5 — KPI COMPUTATION & RENDERING
   ============================================================ */

/**
 * Update the four KPI cards from the filtered dataset.
 * Only TV Show type entries are counted (movies excluded from season KPI).
 */
function renderKPIs(data) {
  // Filter to TV Shows only for season-based KPIs
  const tvShows = data.filter(d => d.type === 'TV Show');

  // --- KPI 1: Total TV Shows ---
  document.getElementById('kpi-total').textContent = tvShows.length.toLocaleString();

  // --- KPI 2: Netflix share among all TV Shows in filtered set ---
  const netflixCount = tvShows.filter(d => d.platform === 'Netflix').length;
  const shareVal     = tvShows.length > 0
    ? ((netflixCount / tvShows.length) * 100).toFixed(1) + '%'
    : '–';
  document.getElementById('kpi-netflix-share').textContent = shareVal;

  // --- KPI 3: Average seasons (TV Shows with parseable season count) ---
  const withSeasons = tvShows.filter(d => d.seasons !== null);
  const avgSeasons  = withSeasons.length > 0
    ? (withSeasons.reduce((s, d) => s + d.seasons, 0) / withSeasons.length).toFixed(1)
    : '–';
  document.getElementById('kpi-avg-seasons').textContent = avgSeasons;

  // --- KPI 4: Most frequent age rating ---
  const ratingCounts = {};
  tvShows.forEach(d => {
    ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
  });
  const topRating = Object.entries(ratingCounts)
    .sort((a, b) => b[1] - a[1])[0];
  document.getElementById('kpi-top-rating').textContent = topRating ? topRating[0] : '–';

  // --- Record count badge ---
  document.getElementById('record-count').textContent = data.length.toLocaleString();
}


/* ============================================================
   SECTION 6 — CHART: TV Show vs. Movie Ratio (Stacked Bar)
   ============================================================ */

function renderTypeRatioChart(data) {
  // Count TV Show vs Movie per platform
  const counts = {};
  PLATFORMS.forEach(p => { counts[p] = { 'TV Show': 0, 'Movie': 0 }; });

  data.forEach(d => {
    if (counts[d.platform]) {
      const type = d.type === 'TV Show' ? 'TV Show' : 'Movie';
      counts[d.platform][type]++;
    }
  });

  const labels   = PLATFORMS;
  const tvData   = labels.map(p => counts[p]['TV Show']);
  const movData  = labels.map(p => counts[p]['Movie']);

  createChart('chart-type-ratio', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'TV Show',
          data: tvData,
          backgroundColor: PLATFORMS.map(p => PLATFORM_COLORS[p] || COLOR_OTHER),
          borderRadius: 6,
          stack: 'content',
        },
        {
          label: 'Movie',
          data: movData,
          backgroundColor: PLATFORMS.map(p => hexAlpha(PLATFORM_COLORS[p] || COLOR_OTHER, 0.35)),
          borderRadius: 6,
          stack: 'content',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#f3f4f6' } },
      },
    },
  });
}


/* ============================================================
   SECTION 7 — CHART: Release Trend per Year (Multi-Line)
   ============================================================ */

function renderReleaseTrendChart(data) {
  // Only TV Shows — count per platform per release year
  const tvShows = data.filter(d => d.type === 'TV Show' && d.releaseYear);

  const yearSet = new Set(tvShows.map(d => d.releaseYear));
  const years   = [...yearSet].sort();

  const datasets = PLATFORMS.map(platform => {
    const perYear = {};
    years.forEach(y => { perYear[y] = 0; });
    tvShows
      .filter(d => d.platform === platform)
      .forEach(d => { perYear[d.releaseYear]++; });

    const color = PLATFORM_COLORS[platform] || COLOR_OTHER;
    return {
      label: platform,
      data: years.map(y => perYear[y]),
      borderColor: color,
      backgroundColor: hexAlpha(color, 0.1),
      tension: 0.4,
      fill: false,
      pointRadius: years.length > 20 ? 2 : 4,
      pointHoverRadius: 6,
      borderWidth: 2,
    };
  });

  createChart('chart-release-trend', {
    type: 'line',
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
        y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
      },
    },
  });
}


/* ============================================================
   SECTION 8 — CHART: Top 10 Genres (Horizontal Bar)
   ============================================================ */

function renderGenresChart(data) {
  // Count genre occurrences across TV Shows only
  const genreCounts = {};
  data
    .filter(d => d.type === 'TV Show')
    .forEach(d => {
      d.genres.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

  // Sort descending, take top 10
  const top10 = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = top10.map(([g]) => g);
  const values = top10.map(([, v]) => v);

  // Generate a gradient of burgundy shades for the bars
  const bgColors = labels.map((_, i) => hexAlpha(COLOR_PRIMARY, 1 - i * 0.07));

  createChart('chart-genres', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'TV Shows',
        data: values,
        backgroundColor: bgColors,
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',         // horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} TV Shows`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#f3f4f6' } },
        y: { grid: { display: false } },
      },
    },
  });
}


/* ============================================================
   SECTION 9 — CHART: Age Rating Distribution (Doughnut)
   ============================================================ */

function renderRatingDistChart(data) {
  const ratingCounts = {};
  data
    .filter(d => d.type === 'TV Show')
    .forEach(d => {
      ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
    });

  // Sort descending by count
  const sorted = Object.entries(ratingCounts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([r]) => r);
  const values = sorted.map(([, v]) => v);

  // Colour palette — cycle through platform colours + extras
  const palette = [
    '#660033', '#1d4ed8', '#d97706', '#059669',
    '#7c3aed', '#dc2626', '#0891b2', '#65a30d',
    '#be185d', '#ea580c',
  ];
  const bgColors = labels.map((_, i) => palette[i % palette.length]);

  createChart('chart-rating-dist', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
              const pct   = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${ctx.raw} shows (${pct}%)`;
            },
          },
        },
      },
    },
  });
}


/* ============================================================
   SECTION 10 — CHART: Top 10 Countries (Horizontal Bar)
   ============================================================ */

function renderCountriesChart(data) {
  const countryCounts = {};
  data
    .filter(d => d.type === 'TV Show')
    .forEach(d => {
      d.countries.forEach(c => {
        countryCounts[c] = (countryCounts[c] || 0) + 1;
      });
    });

  const top10 = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = top10.map(([c]) => c);
  const values = top10.map(([, v]) => v);
  const bgColors = labels.map((_, i) => hexAlpha(COLOR_ACCENT, 1 - i * 0.07));

  createChart('chart-countries', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'TV Shows',
        data: values,
        backgroundColor: bgColors,
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} shows` } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#f3f4f6' } },
        y: { grid: { display: false } },
      },
    },
  });
}


/* ============================================================
   SECTION 11 — CHART: Season Duration Distribution (Bar)
   ============================================================ */

function renderSeasonDistChart(data) {
  // Group TV Shows by season count
  const seasonCounts = {};
  data
    .filter(d => d.type === 'TV Show' && d.seasons !== null)
    .forEach(d => {
      // Cap outliers: group "10+ seasons"
      const key = d.seasons >= 10 ? '10+' : String(d.seasons);
      seasonCounts[key] = (seasonCounts[key] || 0) + 1;
    });

  // Build ordered labels 1,2,...,9,10+
  const orderedKeys = [...Array(9)].map((_, i) => String(i + 1));
  orderedKeys.push('10+');

  const labels = orderedKeys.filter(k => seasonCounts[k]);
  const values = labels.map(k => seasonCounts[k] || 0);

  // Colour: highlight 1-season in amber (most common), rest in burgundy
  const bgColors = labels.map(k =>
    k === '1' ? COLOR_ACCENT : hexAlpha(COLOR_PRIMARY, 0.75)
  );

  createChart('chart-season-dist', {
    type: 'bar',
    data: {
      labels: labels.map(l => `${l} Season${l === '1' ? '' : 's'}`),
      datasets: [{
        label: 'TV Shows',
        data: values,
        backgroundColor: bgColors,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} shows` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
      },
    },
  });
}


/* ============================================================
   SECTION 12 — CHART: Content Lag Line Chart
   Average lag (years) per release year, one line per platform.
   ============================================================ */

function renderScatterChart(data) {
  // Filter to TV Shows with both release year and date-added year parseable
  const tvShows = data.filter(d =>
    d.type === 'TV Show' && d.releaseYear !== null && d.dateAddedYear !== null
  );

  // Collect all release years present in the filtered set, sorted ascending
  const years = [...new Set(tvShows.map(d => d.releaseYear))].sort((a, b) => a - b);

  // For each platform, compute the average content lag per release year
  const datasets = PLATFORMS.map(platform => {
    const platformShows = tvShows.filter(d => d.platform === platform);

    const avgLagByYear = years.map(yr => {
      const bucket = platformShows.filter(d => d.releaseYear === yr);
      if (bucket.length === 0) return null;  // null = no data → spanGaps bridges the gap
      const total = bucket.reduce((sum, d) => sum + (d.dateAddedYear - d.releaseYear), 0);
      return +(total / bucket.length).toFixed(2);
    });

    const color = PLATFORM_COLORS[platform] || COLOR_OTHER;
    return {
      label: platform,
      data: avgLagByYear,
      borderColor: color,
      backgroundColor: hexAlpha(color, 0.08),
      pointBackgroundColor: color,
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      borderWidth: 2.5,
      tension: 0.4,
      fill: false,
      spanGaps: true,
    };
  });

  createChart('chart-scatter', {
    type: 'line',
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            title: items => `Release Year: ${items[0].label}`,
            label: ctx => {
              if (ctx.parsed.y === null) return null;
              const val = ctx.parsed.y;
              return ` ${ctx.dataset.label}: ${val === 0 ? 'Same year (0 yr)' : `+${val} yr avg lag`}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Release Year', font: { size: 11 } },
          grid: { display: false },
          ticks: { maxTicksLimit: 14 },
        },
        y: {
          title: {
            display: true,
            text: 'Avg Years After Release Added to Platform',
            font: { size: 11 },
          },
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => v === 0 ? '0' : `+${v}yr` },
        },
      },
    },
  });
}


/* ============================================================
   SECTION 13 — TABLE: Top 10 Longest-Running TV Shows
   ============================================================ */

/** Map platform name to CSS badge class */
function platformBadgeClass(platform) {
  const map = {
    'Netflix':      'badge-netflix',
    'Disney+':      'badge-disney',
    'Amazon Prime': 'badge-amazon',
    'Hulu':         'badge-hulu',
  };
  return map[platform] || 'badge-other';
}

function renderTop10Table(data) {
  const tbody = document.getElementById('top10-tbody');
  tbody.innerHTML = '';

  // Filter to TV Shows with known season count, sort descending
  const top10 = data
    .filter(d => d.type === 'TV Show' && d.seasons !== null)
    .sort((a, b) => b.seasons - a.seasons)
    .slice(0, 10);

  if (top10.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-gray-400 text-sm">
          No TV Shows found matching the current filters.
        </td>
      </tr>`;
    return;
  }

  top10.forEach((show, index) => {
    const rank    = index + 1;
    const badgeClass = platformBadgeClass(show.platform);

    // Row rank medal colours
    const rankColors = ['#f59e0b','#9ca3af','#b45309'];
    const rankStyle  = rank <= 3
      ? `font-weight:700;color:${rankColors[rank - 1]}`
      : 'color:#6b7280';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2.5 pr-4" style="${rankStyle}">${rank}</td>
      <td class="py-2.5 pr-4 font-medium text-gray-900 max-w-[200px] truncate"
          title="${escapeHtml(show.title)}">${escapeHtml(show.title)}</td>
      <td class="py-2.5 pr-4">
        <span class="platform-badge ${badgeClass}">${escapeHtml(show.platform)}</span>
      </td>
      <td class="py-2.5 pr-4 text-gray-600">${show.releaseYear || '–'}</td>
      <td class="py-2.5 pr-4 text-gray-600">${escapeHtml(show.rating)}</td>
      <td class="py-2.5 pr-4 font-bold" style="color:var(--color-primary)">${show.seasons}</td>
      <td class="py-2.5 text-gray-500 text-xs">${escapeHtml(show.genres.join(', '))}</td>
    `;
    tbody.appendChild(tr);
  });
}


/* ============================================================
   SECTION 14 — ORCHESTRATE RENDER
   ============================================================ */

/**
 * Master render function — called on load and on every filter change.
 * Applies filters then updates all KPIs, charts, and the table.
 */
function renderDashboard() {
  const filtered = applyFilters();

  renderKPIs(filtered);
  renderTypeRatioChart(filtered);
  renderReleaseTrendChart(filtered);
  renderGenresChart(filtered);
  renderRatingDistChart(filtered);
  renderCountriesChart(filtered);
  renderSeasonDistChart(filtered);
  renderScatterChart(filtered);
  renderTop10Table(filtered);
}


/* ============================================================
   SECTION 15 — UTILITY HELPERS
   ============================================================ */

/**
 * Convert a hex colour to rgba string with given alpha (0–1).
 * Supports 3-digit and 6-digit hex codes.
 * hexAlpha('#660033', 0.5) → "rgba(102, 0, 51, 0.5)"
 */
function hexAlpha(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Escape HTML special characters for safe DOM insertion.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ============================================================
   SECTION 16 — ENTRY POINT
   ============================================================ */

document.addEventListener('DOMContentLoaded', loadData);
