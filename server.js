const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// בדיקת חיים
app.get('/health', (req, res) => res.json({ ok: true }));

// ניתוח חשיפה בסיסי: מקבל ?url=
app.get('/analyze', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // דוגמה: אוספים סיגנלים פשוטים לחשיפה
    const metrics = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
      const h1 = document.querySelectorAll('h1').length;
      const h2 = document.querySelectorAll('h2').length;
      const words = text.split(/\s+/).filter(Boolean).length;

      // "ציון" צעצוע רק כדי להתחיל; תתאימי בהמשך
      const score = Math.min(100, Math.round(
        (h1*10) + (h2*5) + (links.length*0.5) + (words/500)
      ));

      return {
        wordCount: words,
        headingCount: { h1, h2 },
        links: links.slice(0, 20),
        score
      };
    });

    res.json({
      url: targetUrl,
      exposureScore: metrics.score,
      details: metrics
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (browser) await browser.close();
  }
});

// פורט שמוגדר ע"י Render או לוקאלי
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
