# Házená Písek TV

Klubová videoplatforma házenkářek **TJ Sokol Písek** — přebaluje veřejné
přenosy z [tvcom.cz](https://www.tvcom.cz) (liga žen v házené) do vlastního
designu a filtruje jen zápasy Písku. Žádný vlastní streaming, jen automatizované
vkládání oficiálního přehrávače s uvedením zdroje. Data i videa se aktualizují
sama, bez ručních kroků.

> Vzniklo úpravou dřívějšího projektu „Beksa TV" (basketbal, Pardubice) —
> stejná architektura, jiná soutěž, jiný tým a jiný vizuál.

## Jak to funguje

```
tvcom.cz (rozpis + embed přehrávače ligy žen v házené)
        │
        ▼
scraper.mjs  ── běží automaticky přes GitHub Actions (cron každé 2 h)
        │
        ▼
data/matches.json  ── scraper sem SLUČUJE výsledek, nikdy ho nepřepisuje celý
        │
        ▼
index.html  ── web si matches.json načte přes fetch() a zobrazí v designu Písku
        │
        ▼
GitHub Pages  ── hosting zdarma, automatický deploy při každém commitu
```

Žádný backend, žádná databáze. Celý „server" jsou statické soubory na GitHub
Pages plus jeden scheduled job, který jednou za čas přepíše jeden JSON soubor.

## Soubory

```
├── index.html                 # celá stránka v jednom souboru (logo i font zapečené jako base64)
├── scraper.mjs                # scraper (Node.js + cheerio)
├── package.json               # jediná závislost: cheerio
├── data/
│   └── matches.json           # výstup scraperu — zápasy + embed GUID
└── .github/workflows/
    └── scrape.yml             # kdy a jak se scraper spouští
```

## Co je ověřeno pro tenhle klub

- **Soutěž na tvcomu:** `Soutez-Hazena-Extraliga-zeny` (v adrese ligy žen; na webu
  se podle sponzora zobrazuje jako „MOL liga žen", nověji „DOPRASTAV liga žen").
  Rozpis: `…/Zapasy/Sport-Hazena/Soutez-Hazena-Extraliga-zeny/Sezona-RRRR-RRRR/`.
- **Tým:** v téhle soutěži je jediný Písek „**Sokol Písek**", takže scraper filtruje
  podle `"Písek"` v názvu — bezpečné, ostatní (mládežnické) týmy Písku hrají jiné
  soutěže a do výběru se nepletou.
- **Odolnost vůči změně sponzora:** oddělovač mezi soupeři a fází zápasu se
  nekotví na název ligy (ten se mění: MOL → DOPRASTAV → …), ale na koncovku
  `Házená … liga žen`. Pozor byl kladen i na to, že soupeř může mít v názvu slovo
  „Házená" (např. „Házená Kynžvart") — parser to nerozbije.
- **Stránka je server-renderovaná** — stačí `fetch()` + `cheerio`, žádný headless
  prohlížeč.
- **Embed přehrávače:** `//embed.tvcom.cz/{GUID}/`, v HTML detailu zápasu; bývá
  předpřipravený i u budoucích zápasů. (Ověřeno na reálných zápasech Písku.)
- **Přepínač sezón na tvcomu:** `…/Sezona-RRRR-RRRR/` — scraper prochází aktuální
  + (dle nastavení) minulé sezóny a slučuje, aby při přechodu na novou sezónu
  nezmizela historie. Stránku ještě neexistující sezóny (přelom ročníků) bez pádu
  přeskočí.

## Výchozí data (seed)

`data/matches.json` obsahuje reálný startovní vzorek zápasů Sokola Písek ze
sezóny 2025/2026 (přímo z výpisů tvcom.cz), z toho tři už mají vyřešené video.
**Zbytek embedů i kompletní/novější rozpis doplní scraper sám při prvním běhu.**
Seed slouží jen k tomu, aby web nebyl při prvním otevření prázdný; po prvním běhu
Actions ho scraper rozšíří a udržuje aktuální.

## Nasazení na GitHub Pages

1. **Založit repozitář** a nahrát soubory. Soubor `.github/workflows/scrape.yml`
   nahrávejte přes **Add file → Create new file** a do názvu vložte **celou cestu**
   `.github/workflows/scrape.yml` (drag&drop upload skryté složky s tečkou běžně
   tiše přeskočí).
2. **Settings → Actions → General → Workflow permissions** → zaškrtnout
   **„Read and write permissions"** (jinak scraper data stáhne, ale nedokáže je
   commitnout zpět).
3. **Settings → Pages** → Source: **Deploy from a branch** → `main` → `/(root)`.
   Když se Pages po uložení nepostaví, přepněte Source pryč a zpátky.
4. **Actions → „Aktualizace zápasů Házená Písek TV" → Run workflow** — první ruční
   spuštění, ať se data hned naplní. Pro jednorázový hlubší backfill historie
   zadejte do pole `seasons_back` vyšší číslo (např. `3`).
5. Volitelně **vlastní doména** — Settings → Pages → Custom domain + CNAME záznam
   u správce DNS mířící na `{username}.github.io`.

> Web běží přes `fetch('data/matches.json')`, což **nefunguje přes `file://`** —
> stránku otevřenou dvojklikem lokálně nic nenačte. Potřebuje HTTP server
> (GitHub Pages, nebo lokálně `python3 -m http.server`).

## Než se pustí naostro k veřejnosti

Re-embedování cizího přehrávače je obvykle v pořádku (jde o jejich oficiální
player, stejný obsah, s otevřeným uvedením zdroje), ale je to jejich
infrastruktura a obsah — **předem kontaktujte tvcom.cz**, popište záměr a jak je
zdroj uvedený, a počkejte na odpověď. Produkční verzi klidně stavte paralelně,
jen ji nezveřejňujte, dokud nepřijde souhlas.

## Vzhled a assety

- **Barevnost** je v `:root{…}` na začátku `<style>` jako CSS proměnné. Vychází
  ze značky Písku (z loga):
  - navy pozadí `--navy #292b7b` (stránka `--bg #191b52`),
  - růžová `--pink #ef7ba8` = primární akční barva (tlačítka „Přehrát", živá tečka,
    odznak DOMA),
  - modrá `--blue #65bbea` = navigační stav (aktivní sezóna/filtr), horní proužek,
    hero pozadí a odznak VENKU,
  - bílé písmo `--text #fff`.
  Původní názvy `--red*` jsou ponechány jako alias na růžovou, aby se dřívější
  styly nemusely přepisovat po jednom.
- **Logo** je v hlavičce jako `<img class="brand-logo" src="data:image/svg+xml;base64,…">`
  (oficiální vektorové SVG znaku TJ Sokol Písek).
- **Font nadpisů:** oficiální klubový **Apotek Wide** (Light + Bold), vložený přímo
  ve `<style>` přes `@font-face` jako base64 WOFF2 (subset latinka + česká/slovenská
  diakritika). Žádné externí načítání z Google Fonts.
- **Odkazy v hlavičce** teď míří na ověřené stránky tvcomu (rozpis ligy, házená na
  tvcom). Až bude po ruce oficiální web oddílu, stačí u `<a … >Rozpis ligy</a>`
  v `index.html` přepsat `href` na klubovou adresu a upravit text.

## Spuštění scraperu lokálně

```
npm install
node scraper.mjs           # aktuální + 1 minulá sezóna
SEASONS_BACK=3 node scraper.mjs   # hlubší jednorázový backfill
```
