const BASE_DETAIL_URL =
  "https://www.courts.go.jp/hanrei/{ID}/detail2/index.html";
const BASE_SEARCH_URL = "https://www.courts.go.jp/hanrei/search1/index.html";
const PAGE_SIZE = 30;

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

/** 令和の開始日 */
const REIWA_START = new Date(2019, 4, 1); // 月は0始まり

/**
 * DateオブジェクトをURLパラメータ用の和暦オブジェクトに変換する
 * 現状は令和のみ対応（2019年5月1日以降を前提）
 * @param {Date} date
 * @returns {{ gengo: string, year: number, month: number, day: number }}
 */
const dateToWareki = (date) => {
  const reiwaYear = date.getFullYear() - REIWA_START.getFullYear() + 1;
  return {
    gengo: "令和",
    year: reiwaYear,
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
};

/**
 * 和暦文字列をyyyy-MM-dd形式に変換する
 * "令和7年3月15日" → "2025-03-15"
 * @param {string} warekiStr
 * @returns {string} 変換できない場合は空文字
 */
const warekiToIso = (warekiStr) => {
  const match = warekiStr.match(/令和([0-9]+)年([0-9]+)月([0-9]+)日/);
  if (!match) return "";

  const [, year, month, day] = match.map(Number);
  const yyyy = year + 2018;
  const MM = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}`;
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
 * 各行の th 直下にある a 要素の href から5桁のIDを取り出す
 * href の形式: ./../{ID}/detail2/index.html
 * @param {string} html
 * @returns {string[]}
 */
const extractIds = (html) => {
  const tableHtml = Parser.data(html)
    .from('<table class="module-sub-page-fixed-table search-result-table">')
    .to("</table>")
    .build();

  const ids = [];
  const thBlocks = Parser.data(tableHtml).from("<th >").to("</th>").iterate();

  for (const thHtml of thBlocks) {
    const href = Parser.data(thHtml).from("<a").from('href="').to('"').build();
    const match = href.match(/\/([0-9]{5})\/detail[0-9]\/index\.html$/);
    if (!match) continue;
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
  const maxColumn = Math.max(...FIELD_COLUMNS.map((f) => f.column));
  const row = new Array(maxColumn).fill("");

  row[0] = id;

  // D列(index=3): judge_date_wareki を yyyy-MM-dd に正規化
  const warekiRaw = metaMap["judge_date_wareki"] ?? "";
  row[1] = warekiToIso(warekiRaw);

  for (const { metaName, column } of FIELD_COLUMNS) {
    row[column - 1] = metaMap[metaName] ?? "";
  }

  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
  console.log(`追記: ${id}`);
};
