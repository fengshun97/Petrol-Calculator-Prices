#!/usr/bin/env node
/**
 * Build prices.json from data.gov.my weekly fuel prices.
 * Intended for the Petrol-Calculator-Prices repo (repo root = parent of scripts/).
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const OUT = path.join(__dirname, '..', 'prices.json');
const API = 'https://api.data.gov.my/data-catalogue/?id=fuelprice';

function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects < 5
        ) {
          const next = new URL(res.headers.location, url).href;
          fetchJson(next, redirects + 1).then(resolve).catch(reject);
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API HTTP ${res.statusCode}`));
            return;
          }
          resolve(JSON.parse(data));
        });
      })
      .on('error', reject);
  });
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const rows = await fetchJson(API);
  const levels = rows.filter((row) => row.series_type === 'level');
  if (!levels.length) {
    throw new Error('No level rows in API response');
  }

  levels.sort((a, b) => a.date.localeCompare(b.date));
  const latest = levels[levels.length - 1];

  let prev = null;
  if (fs.existsSync(OUT)) {
    prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  }

  if (prev?.updatedAt && latest.date < prev.updatedAt) {
    console.log(
      'API week',
      latest.date,
      'is older than prices.json',
      prev.updatedAt,
      '— skipping',
    );
    process.exit(0);
  }

  const ron95 = round2(latest.ron95);
  const diesel = round2(latest.diesel);
  const ron97 = round2(latest.ron97);

  const next = {
    updatedAt: latest.date,
    validUntil: addDays(latest.date, 6),
    source:
      'MoF weekly APM retail prices (Peninsular Malaysia) — https://www.mof.gov.my/portal/ms/berita/siaran-media/harga-minyak',
    note:
      'These are unsubsidised pump / market prices (RM per litre), not subsidy rates. Subsidy rates stay in the app as FUEL_PRICE_RATES.',
    market: {
      RON95: ron95,
      Diesel: diesel,
      RON97: ron97,
    },
    prices: {
      'Subsidy Diesel Cash Card': diesel,
      'BUDI Diesel': diesel,
      'Subsidy Petrol Cash Card': ron95,
      'Budi 95': ron95,
      'E-nelayan': diesel,
      'Taxi / Bus': diesel,
    },
  };

  if (
    prev &&
    prev.updatedAt === next.updatedAt &&
    prev.validUntil === next.validUntil &&
    prev.market?.RON95 === next.market.RON95 &&
    prev.market?.Diesel === next.market.Diesel &&
    prev.market?.RON97 === next.market.RON97
  ) {
    console.log('No change — API still on same week:', latest.date);
    process.exit(0);
  }

  fs.writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`);
  console.log('Updated prices.json for week starting', latest.date);
  console.log('RON95', ron95, 'Diesel', diesel, 'RON97', ron97);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
