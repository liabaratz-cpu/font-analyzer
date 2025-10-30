const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

// SerpAPI key - hardcoded for now (will move to env vars later)
const SERPAPI_KEY = 'edaaa52ea05a7a56ae62ae73bdb8c9cf56f3f2bfae28c5cb934503ac58ccff5b';

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Font Analyzer API is running',
        version: '2.0.0',
        features: {
            webSearch: !!SERPAPI_KEY
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Helper function to search web for font mentions
async function searchFontMentions(fontName, platform) {
    if (!SERPAPI_KEY) {
        // Estimated mentions based on platform
        const estimates = {
            'Google Fonts': { min: 5000, max: 50000 },
            'Adobe Fonts': { min: 2000, max: 20000 },
            'MyFonts': { min: 500, max: 5000 },
            'Fontspring': { min: 300, max: 3000 },
            'default': { min: 100, max: 1000 }
        };

        const range = estimates[platform] || estimates.default;
        const estimated = Math.floor(Math.random() * (range.max - range.min) + range.min);

        // Provide manual search links when no API key
        const searchQuery = encodeURIComponent(`"${fontName}" font`);
        const manualSources = [
            {
                title: `חפש "${fontName}" ב-Google`,
                url: `https://www.google.com/search?q=${searchQuery}`,
                snippet: 'לחץ לחיפוש ידני ב-Google'
            },
            {
                title: `חפש "${fontName}" ב-Bing`,
                url: `https://www.bing.com/search?q=${searchQuery}`,
                snippet: 'לחץ לחיפוש ידני ב-Bing'
            },
            {
                title: `חפש "${fontName}" ב-DuckDuckGo`,
                url: `https://duckduckgo.com/?q=${searchQuery}`,
                snippet: 'לחץ לחיפוש ידני ב-DuckDuckGo'
            }
        ];

        return {
            totalResults: estimated,
            sources: manualSources,
            estimated: true,
            message: 'הערכה (הוסף SerpAPI למדידה מדויקת)'
        };
    }

    try {
        // Search with SerpAPI (Google Search)
        const query = `"${fontName}" font`;
        const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERPAPI_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('SerpAPI error');
        }

        const data = await response.json();

        // Extract organic results
        const sources = (data.organic_results || []).slice(0, 5).map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet || ''
        }));

        // Get total results from search information
        const totalResults = data.search_information?.total_results || 0;

        return {
            totalResults: totalResults,
            sources,
            estimated: false
        };
    } catch (error) {
        console.error('Search error:', error);
        return {
            totalResults: 0,
            sources: [],
            estimated: true,
            error: 'לא ניתן לבצע חיפוש ברשת'
        };
    }
}

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

        // Search for mentions
        console.log('🌐 מחפש אזכורים ברשת...');
        const mentions = await searchFontMentions(analysis.fontName, analysis.platform);

        analysis.mentions = mentions;

        // Update scores with mentions data
        if (mentions.totalResults > 0) {
            const mentionsScore = Math.min(100, Math.log10(mentions.totalResults) * 25);
            analysis.scores.mentionsScore = Math.round(mentionsScore);

            // Recalculate final score
            analysis.scores.final = Math.round(
                (analysis.scores.contentQuality * 0.25) +
                (analysis.scores.weightsScore * 0.30) +
                (analysis.scores.technicalScore * 0.15) +
                (analysis.scores.optimizationScore * 0.10) +
                (analysis.scores.mentionsScore * 0.20)
            );
        }

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

    // Combine bodyText and description for better detection
    const fullText = data.bodyText + ' ' + data.description;

    const hasHebrew = /[\u0590-\u05FF]/.test(fullText) || /hebrew|עברית/i.test(fullText);
    const features = {
        hebrew: hasHebrew,
        opentype: /opentype|otf|אופן טייפ/i.test(fullText),
        webfont: /webfont|woff|פונט אינטרנט|פונט ווב/i.test(fullText),
        variable: /variable.?font|וריאבל|פונט משתנה/i.test(fullText),
        ligatures: /ligatur|ליגטור|ליגטורות/i.test(fullText),
        alternates: /alternate|stylistic|אלטרנטיב|חלופ/i.test(fullText),
        latin: true
    };

    const weights = extractWeights(fullText);

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
        'thin|דק': 100,
        'hairline|שערה': 100,
        'extra.?light|אקסטרה.?לייט|דק במיוחד': 200,
        'ultra.?light|אולטרה.?לייט': 200,
        'light|לייט|קל': 300,
        'regular|רגיל|רגולר': 400,
        'normal|נורמלי': 400,
        'book|ספר': 400,
        'medium|מדיום|בינוני': 500,
        'semi.?bold|סמי.?בולד|חצי.?מודגש': 600,
        'demi.?bold|דמי.?בולד': 600,
        'bold(?!\\s*extra)|בולד(?!\\s*אקסטרה)|מודגש': 700,
        'extra.?bold|אקסטרה.?בולד|מודגש במיוחד': 800,
        'ultra.?bold|אולטרה.?בולד': 800,
        'black|בלק|שחור': 900,
        'heavy|כבד|הבי': 900
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

    const hasItalic = /italic|oblique|נטוי|אלכסוני/i.test(text);
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
    console.log(`🔍 Web search: ${BING_SEARCH_KEY ? 'Enabled' : 'Disabled (using estimates)'}`);
});
