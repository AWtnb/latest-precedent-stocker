const getProperty = (key) => {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Property not found: ${key}`);
  return value;
};

const SHEET_ID = getProperty("SHEET_ID");
const SHEET = SpreadsheetApp.openById(SHEET_ID);
const MAIN_SHEET = SHEET.getSheets()[0];

const COL = {
  URL: 1, // A: 判例URL
  DATE_ISO: 2, // B: 判決日（ISO変換済み）
  DATE_WAREKI: 3, // C: 判決日（和暦）
  COURT_NAME: 4, // D: 裁判所名
  BRANCH_NAME: 5, // E: 支部名
  JUDGE_TYPE: 6, // F: 裁判の種類
  JIKEN_NUMBER: 7, // G: 事件番号
  JIKEN_NAME: 8, // H: 事件名
  NOTE_1: 9, // I: 判示事項要旨
};
