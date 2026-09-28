const BASE_DETAIL_URL =
  "https://www.courts.go.jp/hanrei/{ID}/detail2/index.html";
const BASE_SEARCH_URL = "https://www.courts.go.jp/hanrei/search1/index.html";
const PAGE_SIZE = 30;

/** @type {Array<{metaName: string, column: number}>} */
const FIELD_COLUMNS = [
  { metaName: "composite_jiken_number", column: 2 },
  { metaName: "jiken_name", column: 3 },
  { metaName: "judge_date_wareki", column: 4 },
  { metaName: "court_name", column: 5 },
  { metaName: "judge_type_name", column: 6 },
  { metaName: "note_1", column: 7 },
];

// =====================
// メイン
// =====================

const main = () => {
  const { fromDate, toDate } = getDateRange();
  const existingIds = getExistingIds(MAIN_SHEET);

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
    const ids = extractIds(html);

    for (const id of ids) {
      if (existingIds.has(id)) {
        console.log(`スキップ: ${id}`);
        continue;
      }
      processId(MAIN_SHEET, id);
      existingIds.add(id);
      Utilities.sleep(1000);
    }
  }

  console.log("完了");
};

// =====================
// 日付
// =====================

/**
 * 実行日の前日〜30日前の日付範囲を返す
 * @returns {{ fromDate: Date, toDate: Date }}
 */
const getDateRange = () => {
  const today = new Date();

  const toDate = new Date(today);
  toDate.setDate(today.getDate() - 1);

  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);

  return { fromDate, toDate };
};

/**
 * DateオブジェクトをURLパラメータ用の和暦オブジェクトに変換する
 * @param {Date} date
 * @returns {{ gengo: string, year: number, month: number, day: number }}
 */
const dateToWareki = (date) => {
  const formatted = Utilities.formatDate(date, "Asia/Tokyo", "GGGGyy/MM/dd");
  const [gengoYear, month, day] = formatted.split("/");
  const gengo = gengoYear.slice(0, 2);
  const year = parseInt(gengoYear.slice(2), 10);
  return { gengo, year, month: parseInt(month, 10), day: parseInt(day, 10) };
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
 * 検索結果HTMLから判例IDを抽出する
 * @param {string} html
 * @returns {string[]}
 */
const extractIds = (html) => {
  const tableHtml = Parser.data(html)
    .from('<table class="module-sub-page-fixed-table search-result-table">')
    .to("</table>")
    .build();

  const ids = [];
  const pattern = /href="\.\/\.\.\/([\d]{5})\/detail2\/index\.html"/g;
  let match;
  while ((match = pattern.exec(tableHtml))) {
    ids.push(match[1]);
  }
  return ids;
};

/**
 * HTML内の <meta name="xxx" content="yyy"> からnameをキー、contentを値とするマップを作る
 * ページ本体はJavaScriptで動的に組み立てられるため要素の直接取得はできないが、
 * meta要素はサーバー側で埋め込まれるため確実に取得できる
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
 * @param {string} id
 */
const processId = (sheet, id) => {
  const url = BASE_DETAIL_URL.replace("{ID}", id);
  let html;
  try {
    html = UrlFetchApp.fetch(url).getContentText("UTF-8");
  } catch (e) {
    console.error(`fetch失敗: ${url}`, e);
    return;
  }

  const metaMap = extractMetaMap(html);
  const nextRow = sheet.getLastRow() + 1;
  const row = new Array(FIELD_COLUMNS.length + 1).fill("");

  row[0] = id;
  for (const { metaName, column } of FIELD_COLUMNS) {
    row[column - 1] = metaMap[metaName] ?? "";
  }

  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
  console.log(`追記: ${id}`);
};
