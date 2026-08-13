const puppeteer = require('puppeteer');
const axios = require('axios');

// 環境変数からLINE設定を取得
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

// 監視設定（2026年8月16日 やまびこ214号）
const TARGET_TRAIN_NUMBER = "214";
const TARGET_TRAIN_NAME = "やまびこ214号";
const TARGET_DATE = "2026年8月16日";

async function checkVacancy() {
  console.log(`[${new Date().toISOString()}] 空席確認処理を開始します...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=ja-JP,ja'
    ]
  });

  const page = await browser.newPage();

  // BOT判定回避用のUser-Agent設定
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // サイバーステーションの空席照会フォームへアクセス
    await page.goto('https://www.jr.cyberstation.ne.jp/c_vacant.html', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 乗車日時（8月16日 14:50）と路線の選択
    await page.select('select[name="month"]', '08');
    await page.select('select[name="day"]', '16');
    await page.select('select[name="hour"]', '14');
    await page.select('select[name="minute"]', '50');
    
    await page.select('select[name="line"]', 'TOHOKU');
    await page.type('input[name="dep_stn"]', '新白河');
    await page.type('input[name="arr_stn"]', '東京');

    // 検索ボタン押下
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.click('input[type="submit"]')
    ]);

    const pageContent = await page.content();
    const vacancySymbol = parseVacancySymbol(pageContent, TARGET_TRAIN_NUMBER);

    console.log(`判定結果: ${TARGET_TRAIN_NAME} 指定席ステータス = [ ${vacancySymbol} ]`);

    // ○ または △ の場合、毎回即座にLINE通知を送信
    if (vacancySymbol === '○' || vacancySymbol === '△') {
      console.log("【空席検知】LINE通知を送信します。");
      const message = `\n【新幹線 空席検知！】\n\n対象：${TARGET_DATE} 14:50発\n列車：${TARGET_TRAIN_NAME}\n区間：新白河 → 東京\n種別：指定席\n\n指定席に空き（${vacancySymbol}）が出ました！すぐに予約してください。`;
      await sendLineNotification(message);
    } else {
      console.log("満席（または未検知）のため通知はありません。");
    }

  } catch (error) {
    console.error("処理中にエラーが発生しました:", error.message);
  } finally {
    await browser.close();
    console.log("処理が正常終了しました。");
  }
}

/**
 * HTML文字列から指定席の記号（○, △, ×）を抽出
 */
function parseVacancySymbol(html, trainNumber) {
  if (!html.includes(trainNumber)) {
    return '未見つからず';
  }

  const parts = html.split(trainNumber);
  if (parts.length < 2) return '×';

  const afterTrainRow = parts[1].split('</tr>')[0];

  if (afterTrainRow.includes('○')) return '○';
  if (afterTrainRow.includes('△')) return '△';
  
  return '×';
}

/**
 * LINE Messaging API プッシュ通知送信
 */
async function sendLineNotification(message) {
  try {
    await axios.post('https://api.line.me/v2/bot/message/push', {
      to: LINE_USER_ID,
      messages: [{ type: 'text', text: message }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      }
    });
    console.log("LINE通知の送信に成功しました。");
  } catch (err) {
    console.error("LINE通知送信エラー:", err.response ? err.response.data : err.message);
  }
}

checkVacancy();
