/**
 * 実行日の前日~30日前の日付範囲を返す
 * デバッグ時は引数で基準日を上書きできる
 * @param {Date} [baseDate=new Date()]
 * @returns {{ fromDate: Date, toDate: Date }}
 */
const getDateRange = (baseDate = new Date()) => {
  const toDate = new Date(baseDate);
  toDate.setDate(baseDate.getDate() - 1);

  const fromDate = new Date(baseDate);
  fromDate.setDate(baseDate.getDate() - 30);

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
  const match = warekiStr
    .replace("元年", "1年")
    .match(/令和([0-9]+)年([0-9]+)月([0-9]+)日/);
  if (!match) return "";

  const [, year, month, day] = match.map(Number);
  const yyyy = year + 2018;
  const MM = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}`;
};
