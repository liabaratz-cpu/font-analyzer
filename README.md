# 🔍 Font Exposure Analyzer

**כלי מתקדם לניתוח חשיפה דיגיטלית של פונטים**

כלי זה מאפשר למעצבי פונטים לבדוק את רמת החשיפה של הפונט שלהם באינטרנט, לקבל ניתוח SEO מקיף, ולזהות הזדמנויות לשיפור החשיפה הדיגיטלית.

## 🌟 תכונות עיקריות

### 1. ניתוח URL מלא
- **סריקת דף פונט** - ניתוח מקיף של דף נחיתה של פונט
- **SEO Analysis** - בדיקת title, meta description, HTTPS, structured data
- **Google Ranking** - בדיקת מיקום בתוצאות חיפוש Google
- **Social Media Mentions** - חיפוש אזכורים ב-Twitter, Instagram, Facebook, Behance, Dribbble, Reddit
- **Backlinks** - זיהוי קישורים חיצוניים לדף הפונט
- **AI Analysis** - המלצות חכמות מבוססות GPT לשיפור החשיפה

### 2. חיפוש לפי שם פונט
- חיפוש מהיר של אזכורים ברשתות חברתיות
- מתאים כשאין URL ספציפי
- מציג תוצאות Google ואזכורים חברתיים

### 3. ניתוח קובץ פונט
- העלאת קובץ פונט (TTF, OTF, WOFF, WOFF2)
- ניתוח טכני מדויק:
  - OpenType features (ligatures, alternates)
  - זיהוי weights ו-italic
  - תמיכה בשפות (עברית, לטינית)
  - Variable font detection
  - ספירת glyphs

## 🚀 Demo

**Live Demo:** [https://liabaratz-cpu.github.io/font-analyzer/](https://liabaratz-cpu.github.io/font-analyzer/)

**API Backend:** [https://font-analyzer-ti5w.onrender.com](https://font-analyzer-ti5w.onrender.com)

## 📊 כיצד עובד הציון?

הציון הכולל (1-100) מורכב מ-4 מרכיבים:

1. **SEO Score (25%)** - איכות אופטימיזציה למנועי חיפוש
2. **Google Ranking (30%)** - מיקום בתוצאות חיפוש
3. **Web Mentions (20%)** - מספר תוצאות בחיפוש Google
4. **Social Media (25%)** - נוכחות ברשתות חברתיות

### טווחי ציונים:
- **90-100**: מעולה! חשיפה גבוהה מאוד
- **75-89**: טוב מאוד! חשיפה גבוהה
- **60-74**: בסדר - יש מקום לשיפור
- **40-59**: נמוכה - מומלץ לשפר
- **0-39**: נמוכה מאוד - דורש שיפור משמעותי

## 🛠 טכנולוגיות

### Frontend
- HTML5, CSS3, JavaScript (Vanilla)
- Responsive design
- Canvas API לייצור share cards

### Backend (Node.js)
- **Express** - Web framework
- **Puppeteer** - Web scraping
- **OpenType.js** - Font file parsing
- **OpenAI GPT** - AI analysis and recommendations
- **SerpAPI** - Google search results
- **Multer** - File upload handling

## 📦 התקנה מקומית

### דרישות מוקדמות
- Node.js 18+
- npm או yarn
- OpenAI API key (אופציונלי - לפיצ'רי AI)
- SerpAPI key (מובנה בקוד)

### שלבי התקנה

1. **Clone the repository:**
```bash
git clone https://github.com/liabaratz-cpu/font-analyzer.git
cd font-analyzer
```

2. **התקן תלויות:**
```bash
npm install
```

3. **הגדר environment variables:**
צור קובץ `.env` בתיקיית הפרויקט:
```env
PORT=3000
OPENAI_API_KEY=sk-proj-your-key-here
```

4. **הרץ את השרת:**
```bash
npm start
```

השרת יעלה על: `http://localhost:3000`

5. **פתח את ה-frontend:**
פתח את `index.html` בדפדפן או הגש אותו דרך web server.

**שים לב:** אם אתה רץ מקומית, עדכן את `API_URL` ב-`index.html`:
```javascript
const API_URL = 'http://localhost:3000';
```

## 🌐 Deployment

### Render.com (מומלץ)

1. **צור חשבון ב-Render:** [render.com](https://render.com)

2. **צור Web Service חדש:**
   - Connect to GitHub repository
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **הגדר Environment Variables:**
   - `OPENAI_API_KEY` - מפתח OpenAI שלך

4. **Deploy!**

### GitHub Pages (Frontend בלבד)

ה-frontend כבר מוגש ב-GitHub Pages:
```
https://liabaratz-cpu.github.io/font-analyzer/
```

## 🔑 API Endpoints

### POST `/api/analyze`
ניתוח מלא של URL דף פונט

**Request:**
```json
{
  "url": "https://fonts.google.com/specimen/Roboto"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fontName": "Roboto",
    "scores": {
      "final": 85,
      "seoScore": 90,
      "rankingScore": 95,
      "socialScore": 70,
      "mentionsScore": 85
    },
    "googleRanking": { ... },
    "socialMedia": { ... },
    "seo": { ... },
    "aiSummary": { ... }
  }
}
```

### POST `/api/search-font`
חיפוש פונט לפי שם

**Request:**
```json
{
  "fontName": "Roboto"
}
```

### POST `/api/analyze-file`
ניתוח קובץ פונט

**Request:** `multipart/form-data` עם שדה `fontFile`

## 🤖 פיצ'רי AI (GPT)

כאשר `OPENAI_API_KEY` מוגדר, הכלי מספק:

1. **תיאור ויזואלי של הפונט** - תיאור בעברית של מראה ואופי הפונט
2. **ניתוח איכות תוכן** - הערכת איכות עמוד הנחיתה
3. **ניתוח סנטימנט** - ניתוח רגשות באזכורים ברשת
4. **המלצות אקשן** - 5 המלצות קונקרטיות עם:
   - כותרת ברורה
   - פעולה ספציפית לביצוע
   - הסבר למה זה חשוב
   - השפעה צפויה
   - אומדן זמן

## 📈 דוגמאות שימוש

### דוגמה 1: בדיקת פונט מ-Google Fonts
```
URL: https://fonts.google.com/specimen/Assistant
```
תקבל ניתוח מלא כולל דירוג Google, אזכורים ברשת, והמלצות לשיפור.

### דוגמה 2: חיפוש פונט עברי
```
שם: Assistant
```
תקבל רק אזכורים ברשת + אפשרות להעלות קובץ לניתוח טכני.

### דוגמה 3: ניתוח קובץ פונט
העלה קובץ `.ttf` או `.otf` - תקבל ניתוח טכני מדויק של:
- כל ה-weights
- OpenType features
- תמיכה בשפות
- מספר glyphs

## 🎯 Use Cases

- **מעצבי פונטים** - בדיקת חשיפה של פונטים חדשים
- **חברות עיצוב** - ניטור נוכחות דיגיטלית של ספריית פונטים
- **משווקים** - זיהוי הזדמנויות לשיפור SEO וחשיפה
- **חוקרים** - ניתוח פופולריות של פונטים

## 🐛 Troubleshooting

### השרת לא עונה
- בדוק שה-PORT נכון
- וודא שכל התלויות מותקנות: `npm install`
- בדוק שהשרת רץ: `npm start`

### GPT לא עובד
- וודא ש-`OPENAI_API_KEY` מוגדר ב-environment variables
- בדוק שיש credit ב-OpenAI account
- הכלי ימשיך לעבוד בלי GPT, אך ללא המלצות AI

### Puppeteer נכשל
- Render.com: השתמש ב-`@sparticuz/chromium`
- Local: התקן Chromium: `npx puppeteer browsers install chrome`

## 📄 License

MIT License - ראה קובץ LICENSE

## 👤 Author

**Lia Baratz**
- GitHub: [@liabaratz-cpu](https://github.com/liabaratz-cpu)

## 🙏 Credits

- **SerpAPI** - Google search API
- **OpenAI GPT-4** - AI analysis
- **Puppeteer** - Web scraping
- **OpenType.js** - Font parsing

---

**Built with ❤️ for the font design community**

🚀 **[Try it now!](https://liabaratz-cpu.github.io/font-analyzer/)**
