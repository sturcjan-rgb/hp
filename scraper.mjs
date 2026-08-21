// Házená Písek TV — scraper

import fs from "node:fs";
import * as cheerio from "cheerio";

const BASE = "https://www.tvcom.cz";
const TEAM_MARK = "Písek";
const OUT_PATH = "data/matches.json";
const REQUEST_DELAY_MS = 500;

const SEASONS_BACK = Math.max(0, parseInt(process.env.SEASONS_BACK ?? "1", 10) || 0);

// Přesný seznam týmů v soutěži (seřazený od nejdelších názvů pro bezpečné vyhledání)
const KNOWN_TEAMS = [
  "HC DAC Dunajská Streda",
  "HK Slovan Duslo Šaľa",
  "Handball club Zlín",
  "AHT HC Tatran Stupava",
  "HC Tatran Stupava",
  "IUVENTA Michalovce",
  "DHK Baník Most",
  "Házená Kynžvart",
  "DHK ZORA Olomouc",
  "DHC Slavia Praha",
  "TJ Sokol Poruba",
  "Handball Hodonín",
  "MKS Zaglebie Lubin",
  "KPR Kobierzyce",
  "DHC Plzeň",
  "Sokol Písek"
];

function cleanTeamName(name) {
  if (!name) return "";
  const clean = name.replace(/\s+/g, " ").trim();

  // 1. Zkusíme najít přesnou shodu ze seznamu známých týmů
  for (const team of KNOWN_TEAMS) {
    if (clean.toLowerCase().includes(team.toLowerCase())) {
      return team;
    }
  }

  // 2. Pokud jde o Písek v jiném tvaru
  if (/písek|pisek/i.test(clean)) {
    return "Sokol Písek";
  }

  // 3. Fallback: odříznutí ligových koncovek a balastu
  return clean
    .replace(/(?:Házená\s+)?(?:DOPRASTAV|MOL|WHIL)\s+(?:Extraliga|liga)\s+žen.*$/i, "")
    .replace(/(?:Házená)?(?:DOPRASTAV|MOL|WHIL).*$/i, "")
    .replace(/\.$/, "")
    .trim();
}

function seasonSlug(now, seasonsBack) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  let startYear = m >= 8 ? y : y - 1;
  startYear -= seasonsBack;
  return `${startYear}-${startYear + 1}`;
}

function buildLeagueUrls(now) {
  return Array.from({ length: SEASONS_BACK + 1 }, (_, back) =>
    `${BASE}/Zapasy/Sport-Hazena/Soutez-Hazena-Extraliga-zeny/Sezona-${seasonSlug(now, back)}/`
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "cs-CZ,cs;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pro ${url}`);
  }
  return await res.text();
}

function computeSeason(dateStr) {
  const [day, month, year] = dateStr.split(".").map((s) => parseInt(s.trim(), 10));
  return month >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

function matchKey(m) {
  return `${m.date}|${m.time}|${m.home}|${m.away}`;
}

export function parseMatchAnchor(href, rawText) {
  if (!href || !href.toLowerCase().includes("/soutez-hazena-extraliga-zeny/")) {
    return null;
  }

  let text = rawText.replace(/\s+/g, " ").trim();
  text = text.replace(/^video\.?\s*/i, "");
  text = text.replace(/Studio\s+Házená\.?\s*/i, "");

  const dateMatch = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?\s*(\d{1,2}:\d{2})\.?\s*(.+)$/);
  if (!dateMatch) return null;
  const [, day, month, yearInText, time, rest] = dateMatch;

  const parts = rest.split(/\s+-\s+/);
  if (parts.length < 2) return null;

  const home = cleanTeamName(parts[0]);
  const away = cleanTeamName(parts.slice(1).join(" - "));

  if (!home.includes(TEAM_MARK) && !away.includes(TEAM_MARK)) return null;

  let phase = "Základní část";
  if (/play-?off/i.test(rawText) || /play-?off/i.test(href)) {
    phase = "Play-off";
  }

  let year = yearInText;
  if (!year) {
    const seasonMatch = href.match(/Sezona-(\d{4})-(\d{4})/i);
    if (seasonMatch) {
      const [, y1, y2] = seasonMatch;
      year = Number(month) >= 8 ? y1 : y2;
    }
  }
  if (!year) return null;

  const idMatch = href.match(/\/(\d+)-[^/]+\.htm$/);
  if (!idMatch) return null;

  return {
    id: idMatch[1],
    url: href.startsWith("http") ? href : BASE + href,
    date: `${Number(day)}. ${Number(month)}. ${year}`,
    time,
    home,
    away,
    phase,
    us: home.includes(TEAM_MARK) ? "home" : "away",
  };
}

async function getTeamMatches(leagueUrls) {
  const byId = new Map();

  for (const url of leagueUrls) {
    console.log(`  … prochází ${url}`);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      console.warn(`  ! přeskakuji ${url}: ${e.message}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    const $ = cheerio.load(html);

    $('a[href*="/Zapas/Sport-Hazena/Soutez-Hazena-Extraliga-zeny/"]').each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text();
      const parsed = parseMatchAnchor(href, text);
      if (parsed) byId.set(parsed.id, parsed);
    });

    await sleep(REQUEST_DELAY_MS);
  }

  return [...byId.values()];
}

async function getEmbedId(matchUrl) {
  const html = await fetchHtml(matchUrl);
  const m = html.match(/embed\.tvcom\.cz\/([a-f0-9-]{20,})\//i);
  return m ? m[1] : null;
}

function toTimestamp(m) {
  const [d, mo, y] = m.date.split(".").map((s) => Number(s.trim()));
  const [hh, mm] = m.time.split(":").map(Number);
  return new Date(y, mo - 1, d, hh, mm).getTime();
}

async function main() {
  const now = new Date();
  const leagueUrls = buildLeagueUrls(now);
  console.log(`Stahuji rozpis ligy žen v házené (aktuální + ${SEASONS_BACK} zpět):`);
  const found = await getTeamMatches(leagueUrls);
  console.log(`Nalezeno ${found.length} zápasů Sokola Písek`);

  const resultMatches = new Map();

  for (const m of found) {
    const key = matchKey(m);
    let embed = null;

    try {
      embed = await getEmbedId(m.url);
      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      console.warn(`  ! Nepodařilo se načíst detail (${m.url}): ${e.message}`);
    }

    resultMatches.set(key, {
      date: m.date,
      time: m.time,
      home: m.home,
      away: m.away,
      phase: m.phase,
      us: m.us,
      season: computeSeason(m.date),
      ...(embed ? { embed } : {}),
    });
  }

  const result = [...resultMatches.values()].sort((a, b) => toTimestamp(b) - toTimestamp(a));

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");

  const withVideo = result.filter((m) => m.embed).length;
  const seasons = [...new Set(result.map((m) => m.season))].sort();
  console.log(`Uloženo ${OUT_PATH}: ${result.length} zápasů (sezóny: ${seasons.join(", ")}), ${withVideo} s videem.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Scraper selhal:", err);
    process.exit(1);
  });
}
