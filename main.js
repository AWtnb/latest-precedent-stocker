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
