# 🚂 Deploy to Railway - Step by Step

## למה Railway?
Render חוסם חיבורים ל-OpenAI, אז אנחנו צריכים Railway שמאפשר את זה (חינם!)

## צעדים פשוטים:

### 1️⃣ התחברות ל-Railway
1. לכי ל: **https://railway.app/**
2. לחצי **"Login"** בפינה הימנית העליונה
3. בחרי **"Login with GitHub"**
4. אשרי את ההרשאות

### 2️⃣ יצירת פרויקט חדש
1. אחרי ההתחברות, לחצי **"New Project"**
2. בחרי **"Deploy from GitHub repo"**
3. אם זו הפעם הראשונה, Railway יבקש הרשאה - לחצי **"Configure GitHub App"**
4. בחרי את הrepository: **`font-analyzer`**
5. לחצי **"Deploy Now"**

### 3️⃣ הוספת Environment Variables
1. אחרי שהפרויקט נוצר, לחצי על הפרויקט
2. לכי ל-**"Variables"** tab
3. לחצי **"+ New Variable"**
4. הוסיפי:
   ```
   Key: OPENAI_API_KEY
   Value: [המפתח שקיבלת מ-OpenAI - מתחיל ב-sk-proj-]
   ```
   (השתמשי באותו מפתח שכבר הוספת ב-Render)
5. לחצי **"Add"**

### 4️⃣ קבלת ה-URL
1. לכי ל-**"Settings"** tab
2. תחת **"Domains"** תראי את ה-URL (משהו כמו: `font-analyzer-production.up.railway.app`)
3. **העתיקי את ה-URL הזה!**

### 5️⃣ עדכון ה-Frontend
שלחי לי את ה-URL שקיבלת ואני אעדכן את ה-`index.html` לפנות אליו.

---

## ✅ זהו! אחרי זה הכלי יעבוד עם GPT!

הכל יקח בערך 5 דקות.
