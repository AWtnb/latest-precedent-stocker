const getProperty = (key) => {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Property not found: ${key}`);
  return value;
};

const SHEET_ID = getProperty("SHEET_ID");
const SHEET = SpreadsheetApp.openById(SHEET_ID);
const MAIN_SHEET = SHEET.getSheets()[0];
