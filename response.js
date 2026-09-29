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

  // フォームの回答を取得（順番依存）
  const startDateStr = responses[0].getResponse(); // 開始日 (YYYY-MM-DD)
  const endDateStr = responses[1].getResponse(); // 終了日 (YYYY-MM-DD)
  const email = responses[2].getResponse(); // メールアドレス

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  // 終了日は当日終わりまで含める
  endDate.setHours(23, 59, 59, 999);

  const rows = MAIN_SHEET.getDataRange().getValues();

  const filtered = rows.filter((row) => {
    if (row[3] == "知的財産高等裁判所") return false;
    const rowDate = new Date(row[1]); // 2列目（0-indexed で index 1）
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
  const blob = Utilities.newBlob(
    "\uFEFF" + csv, // BOM付き UTF-8（Excelで文字化けしないよう）
    "text/csv",
    `hanrei_${startDateStr}_${endDateStr}.csv`,
  );

  MailApp.sendEmail({
    to: email,
    subject: `【判例データ】${startDateStr} 〜 ${endDateStr}`,
    body: `${startDateStr} 〜 ${endDateStr} の期間の判例データを添付します。\n該当件数: ${sorted.length} 件`,
    attachments: [blob],
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
        .filter((_, i) => i !== 1)
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
