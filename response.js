// ================================================
// フォーム送信に応答する処理
// ================================================

/**
 * 審級ランクを返す（数値が小さいほど上位）
 * @param {string} courtName - 裁判所名
 * @returns {number}
 */
const getCourtRank = (courtName) => {
  if (courtName.includes("最高裁判所")) return 0;
  if (courtName.includes("高等裁判所")) return 1;
  return 2;
};

/**
 * フォーム送信トリガーのハンドラ
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
const onFormSubmit = (e) => {
  const responses = e.response.getItemResponses();

  const find = (title) =>
    responses.find((r) => r.getItem().getTitle() === title);

  // フォームの回答を取得
  const startDateStr = find("開始日").getResponse(); // YYYY-MM-DD
  const endDateStr = find("終了日").getResponse(); // YYYY-MM-DD
  const email = find("データの送信先アドレス").getResponse();
  const precFilter = find("フィルタ").getResponse();

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  // 終了日は当日終わりまで含める
  endDate.setHours(23, 59, 59, 999);

  const rows = MAIN_SHEET.getDataRange().getValues();

  const filtered = rows.filter((row) => {
    if (precFilter.startsWith("法学教室方式")) {
      // 判示事項が空欄ならスキップ
      if (row[COL.DETAIL - 1].length < 1) return false;
      // URLに `detail7` を含む（=検索結果の見出しが「知的財産裁判例」）ならスキップ
      if (row[COL.URL - 1].includes("detail7")) return false;
    }

    const rowDate = new Date(row[COL.DATE_ISO - 1]);
    return startDate <= rowDate && rowDate <= endDate;
  });

  if (filtered.length === 0) {
    MailApp.sendEmail({
      to: email,
      subject: "【判例データ】該当なし",
      body: `${startDateStr} 〜 ${endDateStr} の期間に該当する判例は見つかりませんでした。`,
    });
    return;
  }

  const sorted = filtered.sort((a, b) => {
    const rankDiff = getCourtRank(a[3]) - getCourtRank(b[3]);
    if (rankDiff !== 0) return rankDiff;

    // 審級が同じなら日付降順
    return new Date(b[1]) - new Date(a[1]);
  });

  const csv = buildCsv(sorted);
  const csvBlob = Utilities.newBlob(
    "\uFEFF" + csv, // BOM付き UTF-8（Excelで文字化けしないよう）
    "text/csv",
    `hanrei_${startDateStr}_${endDateStr}.csv`,
  );
  const report = buildReport(sorted);
  const txtBlob = Utilities.newBlob(
    report,
    "text/txt",
    `hanrei_${startDateStr}_${endDateStr}.txt`,
  );

  MailApp.sendEmail({
    to: email,
    subject: `【判例データ】${startDateStr} 〜 ${endDateStr}`,
    body: `${startDateStr} 〜 ${endDateStr} の期間の判例データを添付します。\n該当件数: ${sorted.length} 件`,
    attachments: [csvBlob, txtBlob],
  });
};

/**
 * 2次元配列を CSV 文字列に変換する
 * @param {any[][]} rows
 * @returns {string}
 */
const buildCsv = (rows) => {
  return rows
    .map((row) =>
      row
        .filter((_, i) => i !== COL.DATE_ISO - 1)
        .map((cell) => {
          const str = String(cell ?? "");
          // カンマ・ダブルクォート・改行を含むセルはクォートで囲む
          if (/[,"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
          return str;
        })
        .join(","),
    )
    .join("\r\n");
};

/**
 * 2次元配列をテキストに変換する
 * @param {any[][]} rows
 * @returns {string}
 */
const buildReport = (rows) => {
  return rows
    .map((row) => {
      const elems = row.map((cell) => String(cell ?? ""));
      const branch = ` ${elems[COL.BRANCH_NAME - 1]}`.trimEnd();
      const category = `　${elems[COL.CATEGORY - 1]}`.trimEnd();
      return [
        `${elems[COL.DATE_JP - 1]}　${elems[COL.COURT_NAME - 1]}${branch}${category}`,
        `${elems[COL.CASE_NUMBER - 1]}　${elems[COL.CASE_NAME - 1]}`,
        elems[COL.URL - 1],
        `${elems[COL.DETAIL - 1]}`,
        "",
      ].join("\r\n");
    })
    .join("\r\n");
};
