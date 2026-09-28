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
