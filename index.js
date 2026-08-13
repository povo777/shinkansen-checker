const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const TARGET_TRAIN_NUMBER = "214";
const TARGET_TRAIN_NAME = "やまびこ214号";
const TARGET_DATE = "2026年8月16日";

app.get('/check', async (req, res) => {
  console.log(`[${new Date().toISOString()}] 外部からの要請により空席確認を開始します...`);

  let vacancySymbol = '×';

  try {
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // 1. JRサイバーステーションのトップ画面へアクセス
    await page.goto('https://www.jr.cyberstation.ne.jp/index.html', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // 2. 検索フォームが含まれるフレーム（またはページ本文）を特定
    let targetFrame = page;
    const frames = page.frames();
    for (const frame of frames) {
      if (frame.url().includes('c_vacant') || (await frame.$('select[name="month"]'))) {
        targetFrame = frame;
        break;
      }
    }

    // もし直接移動が必要な場合のフォールバックアクセス
    if (targetFrame === page && !(await page.$('select[name="month"]'))) {
      await page.goto('https://www.jr.cyberstation.ne.jp/c_vacant.html', { waitUntil: 'networkidle2', timeout: 60000 });
      targetFrame = page;
    }

    // 3. フォーム要素の待機
    await targetFrame.waitForSelector('select[name="month"]', { timeout: 30000 });

    // 4. 検索条件を入力
    await targetFrame.select('select[name="month"]', '08');
    await targetFrame.select('select[name="day"]', '16');
    await targetFrame.select('select[name="hour"]', '14');
    await targetFrame.select('select[name="minute"]', '50');
    await targetFrame.select('select[name="line"]', 'TOHOKU');
    await targetFrame.type('input[name="dep_stn"]', '新白河');
    await targetFrame.type('input[name="arr_stn"]', '東京');

    // 5. 検索実行
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      targetFrame.click('input[type="submit"]')
    ]);

    const pageContent = await page.content();
    vacancySymbol = parseVacancySymbol(pageContent, TARGET_TRAIN_NUMBER);

    await browser.close();

    console.log(`判定結果: ${TARGET_TRAIN_NAME} 指定席ステータス = [ ${vacancySymbol} ]`);

    if (vacancySymbol === '○' || vacancySymbol === '△') {
      console.log("【空席検知】LINE通知を送信します。");
      const message = `\n【新幹線 空席検知！】\n\n対象：${TARGET_DATE} 14:50発\n列車：${TARGET_TRAIN_NAME}\n区間：新白河 → 東京\n種別：指定席\n\n指定席に空き（${vacancySymbol}）が出ました！すぐに予約してください。`;
      await sendLineNotification(message);
    }

    res.send(`Check completed. Status: ${vacancySymbol}`);

  } catch (error) {
    console.error("処理中にエラーが発生しました:", error.message);
    res.status(500).send(`Error: ${error.message}`);
  }
});

function parseVacancySymbol(html, trainNumber) {
  if (!html.includes(trainNumber)) return '未見つからず';
  const parts = html.split(trainNumber);
  if (parts.length < 2) return '×';
  const afterTrainRow = parts[1].split('</tr>')[0];
  if (afterTrainRow.includes('○')) return '○';
  if (afterTrainRow.includes('△')) return '△';
  return '×';
}

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
  } catch (err) {
    console.error("LINE送信エラー:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
