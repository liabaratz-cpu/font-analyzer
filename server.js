const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Font Analyzer API is running',
        version: '1.0.0'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.post('/api/analyze', async (req, res) => {
    let browser;
    
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false,
                error: 'URL is required' 
            });
        }

        console.log('🔍 מנתח:', url);

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        console.log('📄 טוען דף...');
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        console.log('🔎 מחלץ מידע...');
        const data = await page.evaluate(() => {
            const title = document.querySelector('title')?.textContent || '';
            const h1 = document.querySelector('h1')?.textContent || '';
            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
            const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
            const bodyText = (document.body.innerText || document.body.textContent || '').substring(0, 50000);
            
            return {
                title,
                h1,
                description: metaDesc || ogDesc,
                bodyText,
                hasHttps: window.location.protocol === 'https:'
            };
        });

        await browser.close();
        browser = null;

        const urlObj = new URL(url);
        const analysis = analyzeData(data, urlObj);

        console.log('✅ הושלם בהצלחה');
        
        res.json({
            success: true,
            data: analysis
        });

    } catch (error) {
        console.error('❌ שגיאה:', error.message);
        
        if (browser) {
            await browser.close();
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to analyze font', 
            details: error.message 
        });
    }
});

function analyzeData(data, urlObj) {
    const hostname = urlObj.hostname.toLowerCase();
    
    let fontName = data.h1 || data.title.split('|')[0].split('-')[0].trim();
    fontName = fontName.replace(/\s+(font|typeface)$/i, '').trim();
    if (!fontName) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        fontName = pathParts[pathParts.length - 1] || 'Unknown Font';
    }

    const platform = identifyPlatform(hostname);

    const hasHebrew = /[\u0590-\u05FF]/.test(data.bodyText) || /hebrew|עברית/i.test(data.bodyText);
    const features = {
        hebrew: hasHebrew,
        opentype: /opentype|otf/i.test(data.bodyText),
        webfont: /webfont|woff/i.test(data.bodyText),
        variable: /variable.?font/i.test(data.bodyText),
        ligatures: /ligatur/i.test(data.bodyText),
        alternates: /alternate|stylistic/i.test(data.bodyText),
        latin: true
    };

    const weights = extractWeights(data.bodyText);

    const scores = calculateScores({
        platform,
        description: data.description,
        hasHttps: data.hasHttps,
        weights,
        features,
        contentLength: data.bodyText.length
    });

    return {
        url: urlObj.href,
        fontName,
        domain: hostname,
        platform: platform.name,
        platformBoost: platform.boost,
        hasHttps: data.hasHttps,
        description: data.description,
        features,
        weights,
        scores,
        contentLength: data.bodyText.length
    };
}

function identifyPlatform(hostname) {
    const platforms = {
        'fonts.google.com': { name: 'Google Fonts', boost: 35 },
        'fonts.adobe.com': { name: 'Adobe Fonts', boost: 32 },
        'myfonts.com': { name: 'MyFonts', boost: 28 },
        'fontspring.com': { name: 'Fontspring', boost: 25 },
        'fontshop.com': { name: 'FontShop', boost: 26 },
        'typography.com': { name: 'Hoefler & Co', boost: 30 },
        'creativemarket.com': { name: 'Creative Market', boost: 22 }
    };

    for (const [key, value] of Object.entries(platforms)) {
        if (hostname.includes(key)) {
            return value;
        }
    }

    return { name: 'אתר עצמאי', boost: 0 };
}

function extractWeights(text) {
    const detectedWeights = new Set();
    const textLower = text.toLowerCase();

    const weightPatterns = {
        'thin': 100,
        'hairline': 100,
        'extra.?light': 200,
        'ultra.?light': 200,
        'light': 300,
        'regular': 400,
        'normal': 400,
        'book': 400,
        'medium': 500,
        'semi.?bold': 600,
        'demi.?bold': 600,
        'bold': 700,
        'extra.?bold': 800,
        'ultra.?bold': 800,
        'black': 900,
        'heavy': 900
    };

    for (const [pattern, weight] of Object.entries(weightPatterns)) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(textLower)) {
            detectedWeights.add(weight);
        }
    }

    const numericMatches = text.match(/\b([1-9]00)\b/g);
    if (numericMatches) {
        numericMatches.forEach(match => {
            const num = parseInt(match);
            if (num >= 100 && num <= 900 && num % 100 === 0) {
                detectedWeights.add(num);
            }
        });
    }

    const hasItalic = /italic|oblique/i.test(text);
    const weightsArray = Array.from(detectedWeights).sort((a, b) => a - b);

    return {
        detected: weightsArray,
        count: weightsArray.length || 1,
        hasItalic
    };
}

function calculateScores(data) {
    const contentQuality = Math.min(100, 
        20 + 
        data.platform.boost +
        (data.description.length > 50 ? 15 : 0) +
        (data.hasHttps ? 10 : 0) +
        (data.contentLength > 10000 ? 10 : 0)
    );

    const weightsScore = Math.min(100,
        15 +
        (data.weights.count * 9) +
        (data.weights.hasItalic ? 15 : 0) +
        (data.weights.count >= 5 ? 12 : 0) +
        (data.weights.count >= 9 ? 10 : 0)
    );

    const technicalScore = Math.min(100,
        25 +
        (data.features.opentype ? 15 : 0) +
        (data.features.webfont ? 12 : 0) +
        (data.features.variable ? 20 : 0) +
        (data.features.hebrew ? 15 : 0) +
        (data.features.ligatures ? 8 : 0)
    );

    const optimizationScore = Math.min(100,
        30 +
        data.platform.boost +
        (data.hasHttps ? 15 : 0) +
        (data.description.length > 20 ? 10 : 0)
    );

    const finalScore = Math.round(
        (contentQuality * 0.30) +
        (weightsScore * 0.35) +
        (technicalScore * 0.20) +
        (optimizationScore * 0.15)
    );

    return {
        final: finalScore,
        contentQuality: Math.round(contentQuality),
        weightsScore: Math.round(weightsScore),
        technicalScore: Math.round(technicalScore),
        optimizationScore: Math.round(optimizationScore)
    };
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
