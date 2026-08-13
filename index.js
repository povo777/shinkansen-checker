const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 10000;

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const TARGET_TRAIN_NUMBER = "214";
const TARGET_TRAIN_NAME = "やまびこ214号";
const TARGET_DATE = "2026年8月16日";

app.get('/check', async (req, res) => {
  console.log(`[${new Date().toISOString()}] 外部からの要請により空席確認を開始します...`);

  try {
    const formData = querystring.stringify({
      month: '08',
      day: '16',
      hour: '14',
      minute: '50',
      line: 'TOHOKU',
      train_type: '0',
      dep_stn: '新白河',
      arr_stn: '東京'
    });

    const response = await axios.post('https://www.jr.cyberstation.ne.jp/c_vacant.html', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Referer': 'https://www.jr.cyberstation.ne.jp/c_vacant.html'
      },
      timeout: 10000
    });

    const html = response.data;
    const vacancySymbol = parseVacancySymbol(html, TARGET_TRAIN_NUMBER);

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
