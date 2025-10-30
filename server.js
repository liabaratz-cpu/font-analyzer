const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fetch = require('node-fetch');
const opentype = require('opentype.js');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const app = express();
const PORT = process.env.PORT || 3000;

// SerpAPI key
const SERPAPI_KEY = 'edaaa52ea05a7a56ae62ae73bdb8c9cf56f3f2bfae28c5cb934503ac58ccff5b';

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Font Analyzer API is running',
        version: '2.1.0',
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
        return {
            totalResults: 0,
            sources: [],
            estimated: true,
            message: 'No API key configured'
        };
    }

    try {
        const query = `"${fontName}" font`;
        const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${SERPAPI_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('SerpAPI error');
        }

        const data = await response.json();

        const sources = (data.organic_results || []).slice(0, 5).map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet || ''
        }));

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
            error: 'Failed to search'
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

        // Update scores with mentions data if available
        if (mentions.totalResults > 0 && !mentions.estimated) {
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

// New endpoint for font file upload analysis
app.post('/api/analyze-file', upload.single('fontFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No font file uploaded'
            });
        }

        console.log('📁 מנתח קובץ פונט:', req.file.originalname);

        const buffer = req.file.buffer;
        const font = opentype.parse(buffer.buffer);

        // Extract font information
        const fontName = font.names.fullName?.en || font.names.fontFamily?.en || 'Unknown Font';

        // Get weights (from font instances or default)
        const weights = [];
        if (font.tables.fvar && font.tables.fvar.axes) {
            // Variable font
            const weightAxis = font.tables.fvar.axes.find(axis => axis.tag === 'wght');
            if (weightAxis) {
                // Sample common weights within range
                const min = weightAxis.minValue;
                const max = weightAxis.maxValue;
                [100, 200, 300, 400, 500, 600, 700, 800, 900].forEach(w => {
                    if (w >= min && w <= max) weights.push(w);
                });
            }
        } else {
            // Static font - has one weight
            weights.push(400); // Default to Regular
        }

        // Check for OpenType features
        const features = {
            hebrew: false,
            opentype: !!(font.tables.gsub || font.tables.gpos),
            webfont: true, // If we can parse it, it's usable as webfont
            variable: !!(font.tables.fvar),
            ligatures: false,
            alternates: false,
            latin: false
        };

        // Check for ligatures
        if (font.tables.gsub && font.tables.gsub.features) {
            features.ligatures = font.tables.gsub.features.some(f =>
                f.tag === 'liga' || f.tag === 'dlig' || f.tag === 'clig'
            );
            features.alternates = font.tables.gsub.features.some(f =>
                f.tag === 'salt' || f.tag === 'ss01' || f.tag === 'ss02'
            );
        }

        // Check language support
        if (font.glyphs) {
            // Check for Hebrew characters (U+0590 to U+05FF)
            features.hebrew = Object.keys(font.glyphs.glyphs).some(key => {
                const glyph = font.glyphs.glyphs[key];
                return glyph.unicode >= 0x0590 && glyph.unicode <= 0x05FF;
            });

            // Check for Latin characters
            features.latin = Object.keys(font.glyphs.glyphs).some(key => {
                const glyph = font.glyphs.glyphs[key];
                return glyph.unicode >= 0x0041 && glyph.unicode <= 0x007A;
            });
        }

        const hasItalic = font.tables.post && font.tables.post.italicAngle !== 0;

        // Calculate scores for uploaded font
        const scores = {
            contentQuality: 50, // Base score for uploaded font
            weightsScore: Math.min(100, 15 + (weights.length * 9) + (hasItalic ? 15 : 0) + (weights.length >= 5 ? 12 : 0)),
            technicalScore: Math.min(100, 25 +
                (features.opentype ? 15 : 0) +
                (features.webfont ? 12 : 0) +
                (features.variable ? 20 : 0) +
                (features.hebrew ? 15 : 0) +
                (features.ligatures ? 8 : 0)
            ),
            optimizationScore: 70, // Base score
            mentionsScore: 0
        };

        scores.final = Math.round(
            (scores.contentQuality * 0.25) +
            (scores.weightsScore * 0.30) +
            (scores.technicalScore * 0.20) +
            (scores.optimizationScore * 0.15) +
            (scores.mentionsScore * 0.10)
        );

        console.log('✅ ניתוח קובץ הושלם');

        res.json({
            success: true,
            data: {
                fontName,
                source: 'file',
                fileName: req.file.originalname,
                fileSize: req.file.size,
                features,
                weights: {
                    detected: weights,
                    count: weights.length,
                    hasItalic
                },
                scores,
                glyphCount: font.glyphs ? Object.keys(font.glyphs.glyphs).length : 0
            }
        });

    } catch (error) {
        console.error('❌ שגיאה בניתוח קובץ:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze font file',
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
