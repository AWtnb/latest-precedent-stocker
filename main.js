const BASE_SEARCH_URL = "https://www.courts.go.jp/hanrei/search1/index.html";
const PAGE_SIZE = 30;

const main = () => {
  const { fromDate, toDate } = getDateRange();
  const existingUrls = getExistingIds(MAIN_SHEET);

  const firstUrl = buildSearchUrl(fromDate, toDate, 0);
  const firstHtml = UrlFetchApp.fetch(firstUrl).getContentText("UTF-8");
  const totalCount = fetchTotalCount(firstHtml);

  if (totalCount === null) {
    console.log("総件数の取得に失敗しました");
    return;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`総件数: ${totalCount}, 総ページ数: ${totalPages}`);

  for (let page = 0; page < totalPages; page++) {
    const offset = page * PAGE_SIZE;
    const html =
      page === 0
        ? firstHtml
        : UrlFetchApp.fetch(
            buildSearchUrl(fromDate, toDate, offset),
          ).getContentText("UTF-8");
    const urls = extractUrls(html);

    for (const url of urls) {
      if (existingUrls.has(url)) {
        console.log(`スキップ: ${url}`);
        continue;
      }
      processDetailPage(MAIN_SHEET, url);
      existingUrls.add(url);
      Utilities.sleep(1000);
    }
  }

  console.log("完了");
};

// =====================
// URL組み立て
// =====================

/**
 * 検索URLを組み立てる
 * @param {Date} fromDate
 * @param {Date} toDate
 * @param {number} offset
 * @returns {string}
 */
const buildSearchUrl = (fromDate, toDate, offset) => {
  const from = dateToWareki(fromDate);
  const to = dateToWareki(toDate);

  const params = {
    "filter[judgeDateMode]": "2",
    "filter[judgeGengoFrom]": from.gengo,
    "filter[judgeYearFrom]": from.year,
    "filter[judgeMonthFrom]": from.month,
    "filter[judgeDayFrom]": from.day,
    "filter[judgeGengoTo]": to.gengo,
    "filter[judgeYearTo]": to.year,
    "filter[judgeMonthTo]": to.month,
    "filter[judgeDayTo]": to.day,
    offset: offset,
  };

  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return `${BASE_SEARCH_URL}?${query}`;
};

// =====================
// スクレイピング
// =====================

/** @type {Array<{metaName: string, column: number}>} */
const FIELD_COLUMNS = [
  { metaName: "composite_jiken_number", column: 3 },
  { metaName: "jiken_name", column: 4 },
  { metaName: "judge_date_wareki", column: 5 },
  { metaName: "court_name", column: 6 },
  { metaName: "branch_name", column: 7 },
  { metaName: "judge_type_name", column: 8 },
  { metaName: "note_1", column: 9 },
];

/**
 * 検索結果HTMLから総件数を取得する
 * @param {string} html
 * @returns {number | null}
 */
const fetchTotalCount = (html) => {
  const text = Parser.data(html)
    .from('<div class="paging-parts2">')
    .to("</div>")
    .build();
  const match = text.match(/(\d+)件中/);
  if (!match) return null;
  return parseInt(match[1], 10);
};

/**
 * 検索結果HTMLから各判例のURLを抽出する
 * 各行の th 直下にある a 要素の href から5桁のIDを取り出す
 * @param {string} html
 * @returns {string[]}
 */
const extractUrls = (html) => {
  const tableHtml = Parser.data(html)
    .from('<table class="module-sub-page-fixed-table search-result-table">')
    .to("</table>")
    .build();

  const urls = [];
  const thBlocks = Parser.data(tableHtml).from("<th >").to("</th>").iterate();

  for (const thHtml of thBlocks) {
    const href = Parser.data(thHtml).from("<a").from('href="').to('"').build();
    if (!href) continue;
    urls.push(`https://www.courts.go.jp/hanrei/${href.slice(5)}`);
  }

  return urls;
};

/**
 * HTML内の <meta name="xxx" content="yyy"> からnameをキー、contentを値とするマップを作る
 * meta要素は確実かつ簡単に取得できるため
 * @param {string} html
 * @returns {Object<string, string>}
 */
const extractMetaMap = (html) => {
  const metaMap = {};
  const pattern = /<meta\s+name="([^"]+)"\s+content="([^"]*)"/g;

  let match;
  while ((match = pattern.exec(html))) {
    const [, name, content] = match;
    if (name in metaMap) continue;
    metaMap[name] = content;
  }

  if (!metaMap["note_1"] || metaMap["note_1"].trim().length < 1) {
    // <dt>判示事項の要旨</dt> の直後の <dd> 内の <p> テキストを取得
    // [\s\S] で改行を含む任意文字にマッチさせる
    const sectionMatch = html.match(
      /<dt>判示事項の要旨<\/dt>\s*<dd><p[^>]*>([\s\S]*?)<\/p><\/dd>/,
    );
    if (sectionMatch) {
      metaMap["note_1"] = sectionMatch[1].trim();
    }
  }
  return metaMap;
};

// =====================
// スプレッドシート
// =====================

/**
 * A列の既存IDをSetとして取得する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Set<string>}
 */
const getExistingIds = (sheet) => {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return new Set();

  const values = sheet.getRange(1, 1, lastRow, 1).getValues();
  return new Set(
    values
      .flat()
      .map(String)
      .filter((v) => 0 < v.length),
  );
};

/**
 * 個別ページにアクセスしてメタ情報を取得し、シートに1行追記する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} url
 */
const processDetailPage = (sheet, url) => {
  let html;
  try {
    html = UrlFetchApp.fetch(url).getContentText("UTF-8");
  } catch (e) {
    console.error(`fetch失敗: ${url}`, e);
    return;
  }

  const metaMap = extractMetaMap(html);
  const nextRow = sheet.getLastRow() + 1;
  const maxColumn = Math.max(...FIELD_COLUMNS.map((f) => f.column));
  const row = new Array(maxColumn).fill("");

  row[0] = url;

  // D列(index=3): judge_date_wareki を yyyy-MM-dd に正規化
  const warekiRaw = metaMap["judge_date_wareki"] ?? "";
  row[1] = warekiToIso(warekiRaw);

  for (const { metaName, column } of FIELD_COLUMNS) {
    row[column - 1] = metaMap[metaName] ?? "";
  }

  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
  console.log(`追記: ${url}`);
};
