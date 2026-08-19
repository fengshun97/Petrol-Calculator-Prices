#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'prices.json');
const API = 'https://api.data.gov.my/data-catalogue?id=fuelprice';

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);

  const rows = await res.json();
  const levels = rows.filter((r) => r.series_type === 'level');
  if (!levels.length) throw new Error('No level rows in API');

  levels.sort((a, b) => a.date.localeCompare(b.date));
  const latest = levels[levels.length - 1];

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
    market: { RON95: ron95, Diesel: diesel, RON97: ron97 },
    prices: {
      'Subsidy Diesel Cash Card': diesel,
      'BUDI Diesel': diesel,
      'Subsidy Petrol Cash Card': ron95,
      'Budi 95': ron95,
      'E-nelayan': diesel,
      'Taxi / Bus': diesel,
    },
  };

  let prev = null;
  if (fs.existsSync(OUT)) {
    prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  }

  if (prev && prev.updatedAt === next.updatedAt && prev.validUntil === next.validUntil) {
    console.log('No change — API still on same week:', latest.date);
    process.exit(0);
  }

  fs.writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`);
  console.log('Updated prices.json for week starting', latest.date);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});