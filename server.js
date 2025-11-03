const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fetch = require('node-fetch');
const opentype = require('opentype.js');
const multer = require('multer');
const OpenAI = require('openai');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const app = express();
const PORT = process.env.PORT || 3000;

// SerpAPI key - for Google Search ranking and results
const SERPAPI_KEY = 'edaaa52ea05a7a56ae62ae73bdb8c9cf56f3f2bfae28c5cb934503ac58ccff5b';

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openai = OPENAI_API_KEY ? new OpenAI({
    apiKey: OPENAI_API_KEY,
    timeout: 60000, // 60 seconds
    maxRetries: 3
}) : null;

// Log OpenAI status on startup
console.log('🤖 OpenAI Status:');
console.log('  API Key present:', !!OPENAI_API_KEY);
console.log('  API Key length:', OPENAI_API_KEY.length);
console.log('  OpenAI client:', openai ? 'Initialized' : 'Not initialized');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Font Analyzer API is running',
        version: '2.1.0',
        features: {
            webSearch: !!SERPAPI_KEY,
            gptAnalysis: !!openai
        },
        debug: {
            openaiKeyPresent: !!OPENAI_API_KEY,
            openaiKeyLength: OPENAI_API_KEY.length,
            openaiClientInitialized: !!openai
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Helper function to analyze Google Search ranking and SEO
async function analyzeGoogleRanking(fontPageUrl, fontName) {
    if (!SERPAPI_KEY) {
        return {
            totalResults: 0,
            pageRank: null,
            pageNumber: null,
            sources: [],
            estimated: true,
            message: 'No API key configured'
        };
    }

    try {
        // Search for common phrases people use: "פונט [name]", "font [name]", "גופן [name]"
        // This matches natural search queries
        const query = `("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}" OR "${fontName} פונט" OR "${fontName} font" OR "${fontName} גופן")`;
        const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&num=100&api_key=${SERPAPI_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('SerpAPI error');
        }

        const data = await response.json();

        // Find where the font page ranks
        let pageRank = null;
        let pageNumber = null;

        if (data.organic_results) {
            const normalizedUrl = fontPageUrl.toLowerCase().replace(/^https?:\/\//i, '').replace(/\/$/, '');

            for (let i = 0; i < data.organic_results.length; i++) {
                const resultUrl = data.organic_results[i].link.toLowerCase().replace(/^https?:\/\//i, '').replace(/\/$/, '');

                if (resultUrl.includes(normalizedUrl) || normalizedUrl.includes(resultUrl)) {
                    pageRank = i + 1;
                    pageNumber = Math.ceil((i + 1) / 10);
                    break;
                }
            }
        }

        const sources = (data.organic_results || []).slice(0, 5).map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet || '',
            position: item.position
        }));

        const totalResults = data.search_information?.total_results || 0;

        return {
            totalResults: totalResults,
            pageRank: pageRank,
            pageNumber: pageNumber,
            sources,
            estimated: false
        };
    } catch (error) {
        console.error('Search error:', error);
        return {
            totalResults: 0,
            pageRank: null,
            pageNumber: null,
            sources: [],
            estimated: true,
            error: 'Failed to search'
        };
    }
}

// Helper function to search backlinks (pages linking to font page)
async function searchBacklinks(fontPageUrl) {
    if (!SERPAPI_KEY) {
        return {
            totalBacklinks: 0,
            sources: []
        };
    }

    try {
        // Search for the URL in quotes to find pages mentioning it
        // Note: Google's link: operator was deprecated in 2017
        const query = `"${fontPageUrl}"`;
        const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&num=20&api_key=${SERPAPI_KEY}`;

        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            const totalBacklinks = data.search_information?.total_results || 0;

            // Filter out the font page itself from results
            const fontDomain = new URL(fontPageUrl).hostname;
            const sources = (data.organic_results || [])
                .filter(item => {
                    try {
                        const itemDomain = new URL(item.link).hostname;
                        return itemDomain !== fontDomain; // Exclude same domain
                    } catch {
                        return true;
                    }
                })
                .slice(0, 5)
                .map(item => ({
                    title: item.title,
                    url: item.link,
                    snippet: item.snippet || '',
                    type: 'backlink'
                }));

            return {
                totalBacklinks: Math.max(0, totalBacklinks - 1), // Subtract the font page itself
                sources
            };
        }
    } catch (error) {
        console.error('Backlinks search error:', error);
    }

    return {
        totalBacklinks: 0,
        sources: []
    };
}

// Helper function to search social media mentions
async function searchSocialMediaMentions(fontName) {
    if (!SERPAPI_KEY) {
        return {
            twitter: 0,
            instagram: 0,
            facebook: 0,
            behance: 0,
            dribbble: 0,
            reddit: 0,
            total: 0,
            sources: []
        };
    }

    try {
        const platforms = [
            { name: 'twitter', query: `site:twitter.com ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` },
            { name: 'instagram', query: `site:instagram.com ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` },
            { name: 'facebook', query: `(site:facebook.com/*/posts OR site:facebook.com/groups OR site:facebook.com/photo OR site:facebook.com/share) ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` },
            { name: 'behance', query: `site:behance.net ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` },
            { name: 'dribbble', query: `site:dribbble.com ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` },
            { name: 'reddit', query: `site:reddit.com ("פונט ${fontName}" OR "font ${fontName}" OR "גופן ${fontName}")` }
        ];

        const results = {
            twitter: 0,
            instagram: 0,
            facebook: 0,
            behance: 0,
            dribbble: 0,
            reddit: 0,
            total: 0,
            sources: []
        };

        // Search each platform
        for (const platform of platforms) {
            try {
                const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(platform.query)}&num=10&api_key=${SERPAPI_KEY}`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    const count = data.search_information?.total_results || 0;
                    results[platform.name] = count;
                    results.total += count;

                    // Add top 10 sources from each platform, but only if they actually mention the font name
                    if (data.organic_results && data.organic_results.length > 0) {
                        const topResults = data.organic_results.slice(0, 10);
                        topResults.forEach(result => {
                            // Check if font name appears in title or snippet (case insensitive)
                            const combinedText = `${result.title || ''} ${result.snippet || ''}`.toLowerCase();
                            const fontNameLower = fontName.toLowerCase();

                            // Only add if BOTH the font name AND a font-related keyword appear together
                            const hasFontName = combinedText.includes(fontNameLower);
                            const hasFontKeyword = /(\bפונט\b|\bfont\b|\bגופן\b)/.test(combinedText);

                            // Also check that they appear close to each other (within 50 characters)
                            let isRelevant = false;
                            if (hasFontName && hasFontKeyword) {
                                const fontNameIndex = combinedText.indexOf(fontNameLower);
                                const fontKeywordMatches = combinedText.match(/(\bפונט\b|\bfont\b|\bגופן\b)/g);
                                if (fontKeywordMatches) {
                                    // Check if any font keyword is within 50 chars of font name
                                    isRelevant = fontKeywordMatches.some(keyword => {
                                        const keywordIndex = combinedText.indexOf(keyword);
                                        return Math.abs(keywordIndex - fontNameIndex) < 50;
                                    });
                                }
                            }

                            if (isRelevant) {
                                results.sources.push({
                                    platform: platform.name,
                                    title: result.title,
                                    url: result.link,
                                    snippet: result.snippet || ''
                                });
                            }
                        });
                    }
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err) {
                console.error(`Error searching ${platform.name}:`, err);
            }
        }

        return results;
    } catch (error) {
        console.error('Social media search error:', error);
        return {
            twitter: 0,
            instagram: 0,
            behance: 0,
            dribbble: 0,
            reddit: 0,
            total: 0,
            sources: []
        };
    }
}

// Helper function to analyze SEO score
function analyzeSEO(pageData, url) {
    const seo = {
        score: 0,
        details: {
            hasTitle: false,
            titleLength: 0,
            hasMetaDescription: false,
            descriptionLength: 0,
            hasH1: false,
            hasHttps: false,
            hasOpenGraph: false,
            hasStructuredData: false,
            hasCanonical: false,
            mobileOptimized: false,
            imageOptimization: 0,
            contentLength: 0
        }
    };

    let score = 0;

    // Title check (15 points)
    if (pageData.title && pageData.title.length > 0) {
        seo.details.hasTitle = true;
        seo.details.titleLength = pageData.title.length;
        if (pageData.title.length >= 30 && pageData.title.length <= 60) {
            score += 15;
        } else if (pageData.title.length > 0) {
            score += 8;
        }
    }

    // Meta description (15 points)
    if (pageData.description && pageData.description.length > 0) {
        seo.details.hasMetaDescription = true;
        seo.details.descriptionLength = pageData.description.length;
        if (pageData.description.length >= 120 && pageData.description.length <= 160) {
            score += 15;
        } else if (pageData.description.length > 0) {
            score += 8;
        }
    }

    // H1 check (10 points)
    if (pageData.h1 && pageData.h1.length > 0) {
        seo.details.hasH1 = true;
        score += 10;
    }

    // HTTPS (15 points)
    if (pageData.hasHttps) {
        seo.details.hasHttps = true;
        score += 15;
    }

    // Open Graph tags (10 points)
    if (pageData.hasOpenGraph) {
        seo.details.hasOpenGraph = true;
        score += 10;
    }

    // Structured Data (15 points)
    if (pageData.hasStructuredData) {
        seo.details.hasStructuredData = true;
        score += 15;
    }

    // Canonical URL (5 points)
    if (pageData.hasCanonical) {
        seo.details.hasCanonical = true;
        score += 5;
    }

    // Mobile optimization (10 points)
    if (pageData.hasMobileViewport) {
        seo.details.mobileOptimized = true;
        score += 10;
    }

    // Content length (5 points)
    seo.details.contentLength = pageData.bodyText ? pageData.bodyText.length : 0;
    if (seo.details.contentLength > 1000) {
        score += 5;
    }

    seo.score = Math.min(100, score);
    return seo;
}

// Smart content analysis based on page data
function analyzeContentWithGPT(pageData, fontName) {
    const title = pageData.title || '';
    const description = pageData.description || pageData.metaDesc || '';
    const h1 = pageData.h1 || '';
    const bodyText = pageData.bodyText || '';
    const contentLength = bodyText.length;

    // Calculate content score (1-10)
    let contentScore = 5;
    if (contentLength > 1000) contentScore += 2;
    if (contentLength > 500) contentScore += 1;
    if (description.length > 100) contentScore += 1;
    if (h1 && h1.includes(fontName)) contentScore += 1;
    contentScore = Math.min(10, contentScore);

    // Calculate marketing score (1-10)
    let marketingScore = 5;
    if (title.length >= 30 && title.length <= 60) marketingScore += 2;
    if (description.length >= 120) marketingScore += 1;
    if (bodyText.includes('ייחוד') || bodyText.includes('מיוחד') || bodyText.includes('אופי')) marketingScore += 1;
    if (pageData.ogTitle || pageData.ogDesc) marketingScore += 1;
    marketingScore = Math.min(10, marketingScore);

    // Identify strengths
    const strengths = [];
    if (contentLength > 800) {
        strengths.push('תיאור מפורט ואינפורמטיבי של הפונט');
    }
    if (pageData.hasHttps) {
        strengths.push('אתר מאובטח עם HTTPS');
    }
    if (pageData.ogTitle && pageData.ogDesc) {
        strengths.push('אופטימיזציה טובה לשיתוף ברשתות חברתיות');
    }
    if (h1 && description) {
        strengths.push('מבנה עמוד ברור עם כותרת ותיאור');
    }

    // If we have few strengths, add generic positive notes
    if (strengths.length < 2) {
        strengths.push('העמוד מכיל מידע בסיסי על הפונט');
        strengths.push('הפונט מוצג באופן ברור');
    }

    // Identify improvements
    const improvements = [];
    if (contentLength < 500) {
        improvements.push('הרחיבו את תיאור הפונט - הוסיפו סיפור, דוגמאות שימוש, ומקרים שבהם הפונט מתאים');
    }
    if (!description || description.length < 100) {
        improvements.push('הוסיפו תיאור מפורט ב-meta description לשיפור SEO');
    }
    if (!pageData.ogTitle || !pageData.ogDesc) {
        improvements.push('הוסיפו Open Graph tags לשיתוף מושלם ברשתות חברתיות');
    }
    if (title.length < 30) {
        improvements.push('הרחיבו את כותרת העמוד כך שתכלול מילות מפתח רלוונטיות');
    }
    if (!bodyText.includes('דוגמ') && !bodyText.includes('example')) {
        improvements.push('הוסיפו דוגמאות שימוש ומקרי מבחן לפונט');
    }

    // Take top 2-3
    const topStrengths = strengths.slice(0, 3);
    const topImprovements = improvements.slice(0, 3);

    return {
        enabled: true,
        contentScore: contentScore,
        marketingScore: marketingScore,
        strengths: topStrengths,
        improvements: topImprovements,
        method: 'rule-based'
    };
}

// Smart sentiment analysis of mentions using keyword detection
function analyzeMentionsSentiment(sources, fontName) {
    if (!sources || sources.length === 0) {
        return {
            enabled: true,
            positive: 0,
            neutral: 0,
            negative: 0,
            highlights: ['לא נמצאו איזכורים לניתוח'],
            method: 'rule-based'
        };
    }

    // Positive keywords in Hebrew and English
    const positiveKeywords = [
        'מדהים', 'נהדר', 'מעולה', 'יפה', 'מושלם', 'איכותי', 'מומלץ', 'ממליצ',
        'אוהב', 'אהבת', 'מעוצב', 'ייחודי', 'מיוחד', 'מרשים', 'professional',
        'beautiful', 'amazing', 'excellent', 'love', 'perfect', 'great', 'wonderful',
        'stunning', 'gorgeous', 'recommend', 'best', 'favorite', 'quality'
    ];

    // Negative keywords in Hebrew and English
    const negativeKeywords = [
        'גרוע', 'רע', 'לא טוב', 'בעיה', 'באג', 'שגיאה', 'לא עובד', 'קשה',
        'מסובך', 'לא ברור', 'bad', 'poor', 'terrible', 'awful', 'problem',
        'issue', 'broken', 'difficult', 'confusing', 'disappointing'
    ];

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    const highlights = [];

    // Analyze each source
    sources.slice(0, 10).forEach(source => {
        const text = `${source.title || ''} ${source.snippet || ''}`.toLowerCase();

        // Count positive and negative keyword matches
        let positiveCount = 0;
        let negativeCount = 0;

        positiveKeywords.forEach(keyword => {
            if (text.includes(keyword.toLowerCase())) positiveCount++;
        });

        negativeKeywords.forEach(keyword => {
            if (text.includes(keyword.toLowerCase())) negativeCount++;
        });

        // Classify based on keyword counts
        if (positiveCount > negativeCount && positiveCount > 0) {
            positive++;
            // Add as highlight if very positive
            if (positiveCount >= 2 && highlights.length < 3) {
                highlights.push(source.title || source.snippet?.substring(0, 100));
            }
        } else if (negativeCount > positiveCount && negativeCount > 0) {
            negative++;
        } else {
            neutral++;
            // Add popular neutral mentions as highlights
            if (highlights.length < 3 && (source.platform === 'instagram' || source.platform === 'behance')) {
                highlights.push(source.title || source.snippet?.substring(0, 100));
            }
        }
    });

    // If no highlights found, add the first few source titles
    if (highlights.length === 0 && sources.length > 0) {
        sources.slice(0, 3).forEach(s => {
            if (s.title) highlights.push(s.title);
        });
    }

    // Limit to 3 highlights
    const finalHighlights = highlights.slice(0, 3);

    return {
        enabled: true,
        positive: positive,
        neutral: neutral,
        negative: negative,
        highlights: finalHighlights.length > 0 ? finalHighlights : ['נמצאו איזכורים של הפונט ברשת'],
        method: 'rule-based'
    };
}

// Smart summary and recommendations based on data analysis
function generateSummaryAndRecommendations(allData, fontName) {
    const seoScore = allData.scores?.seoScore || 0;
    const rankingScore = allData.scores?.rankingScore || 0;
    const socialScore = allData.scores?.socialScore || 0;
    const finalScore = allData.scores?.final || 0;
    const pageRank = allData.googleRanking?.pageRank;
    const totalMentions = allData.socialMedia?.total || 0;
    const backlinks = allData.backlinks?.totalBacklinks || 0;

    // Determine priority
    let priority = 'medium';
    if (finalScore < 30) priority = 'high';
    else if (finalScore > 70) priority = 'low';

    // Build summary
    let summary = '';
    if (finalScore >= 70) {
        summary = `הפונט "${fontName}" נמצא במצב חשיפה מצוין! הציון הכולל ${finalScore}/100 מעיד על נוכחות דיגיטלית חזקה. `;
    } else if (finalScore >= 40) {
        summary = `הפונט "${fontName}" נמצא במצב חשיפה סביר עם ציון ${finalScore}/100. יש פוטנציאל משמעותי לשיפור. `;
    } else {
        summary = `הפונט "${fontName}" זקוק לשיפור משמעותי בחשיפה (ציון: ${finalScore}/100). `;
    }

    // Add specific insights
    if (pageRank) {
        summary += `הפונט מדורג במקום #${pageRank} בגוגל. `;
    } else {
        summary += `הפונט לא מופיע ב-100 התוצאות הראשונות בגוגל. `;
    }

    if (totalMentions > 0) {
        summary += `נמצאו ${totalMentions} איזכורים ברשתות חברתיות.`;
    } else {
        summary += `לא נמצאו איזכורים ברשתות חברתיות.`;
    }

    // Build recommendations
    const recommendations = [];

    // SEO recommendations
    if (seoScore < 60) {
        recommendations.push('שפרו את ה-SEO של העמוד: הוסיפו תיאור מפורט, כותרות ברורות, ו-meta tags מלאים');
    }

    // Ranking recommendations
    if (!pageRank || pageRank > 10) {
        recommendations.push('שפרו את הדירוג בגוגל: הוסיפו תוכן איכותי, מילות מפתח רלוונטיות, וקישורים פנימיים');
    }

    // Social media recommendations
    if (totalMentions < 5) {
        recommendations.push('הגבירו נוכחות ברשתות חברתיות: פרסמו דוגמאות שימוש, שתפו בקבוצות עיצוב, והדגישו תכונות ייחודיות');
    } else if (allData.socialMedia?.instagram < 2) {
        recommendations.push('פרסמו יותר באינסטגרם - זוהי פלטפורמה מרכזית למעצבים');
    }

    // Backlinks recommendations
    if (backlinks < 3) {
        recommendations.push('השיגו קישורים חיצוניים: פרסמו מאמרים, השתתפו בפורומים, ושתפו פעולה עם מעצבים');
    }

    // Content recommendations
    if (allData.contentLength < 500) {
        recommendations.push('הרחיבו את תיאור הפונט: הוסיפו סיפור, דוגמאות שימוש, והמלצות למתי להשתמש בפונט');
    }

    // If we have too few recommendations, add general ones
    if (recommendations.length < 3) {
        if (!recommendations.some(r => r.includes('תמונות'))) {
            recommendations.push('הוסיפו דוגמאות חזותיות איכותיות של הפונט בשימוש');
        }
        if (!recommendations.some(r => r.includes('וידאו'))) {
            recommendations.push('שקלו ליצור וידאו קצר המציג את הפונט');
        }
    }

    // Take top 3
    const topRecommendations = recommendations.slice(0, 3);

    return {
        enabled: true,
        summary: summary.trim(),
        recommendations: topRecommendations,
        priority: priority,
        method: 'rule-based'  // Indicate this is not GPT
    };
}

// Calculate final exposure score based on all metrics
function calculateFinalScore(data) {
    const scores = {
        seoScore: 0,
        rankingScore: 0,
        mentionsScore: 0,
        socialScore: 0,
        total: 0
    };

    // SEO Score (25% weight)
    scores.seoScore = data.seoScore || 0;

    // Google Ranking Score (30% weight)
    let rankingScore = 0;
    if (data.googleRanking && data.googleRanking.pageRank !== null) {
        // First page (1-10) = 90-100 points
        // Second page (11-20) = 70-89 points
        // Third page (21-30) = 50-69 points
        // Beyond = decreasing score
        if (data.googleRanking.pageRank <= 10) {
            rankingScore = 100 - (data.googleRanking.pageRank - 1);
        } else if (data.googleRanking.pageRank <= 20) {
            rankingScore = 80 - ((data.googleRanking.pageRank - 10) * 2);
        } else if (data.googleRanking.pageRank <= 30) {
            rankingScore = 60 - ((data.googleRanking.pageRank - 20) * 2);
        } else {
            rankingScore = Math.max(10, 50 - (data.googleRanking.pageRank - 30));
        }
    }

    // Total mentions score (20% weight)
    if (data.googleRanking && data.googleRanking.totalResults > 0) {
        // Logarithmic scale for total results
        const results = data.googleRanking.totalResults;
        if (results >= 10000) {
            scores.mentionsScore = 100;
        } else if (results >= 5000) {
            scores.mentionsScore = 90;
        } else if (results >= 1000) {
            scores.mentionsScore = 75;
        } else if (results >= 500) {
            scores.mentionsScore = 60;
        } else if (results >= 100) {
            scores.mentionsScore = 40;
        } else if (results >= 10) {
            scores.mentionsScore = 20;
        } else {
            scores.mentionsScore = 10;
        }
    }

    // Social Media Score (25% weight)
    if (data.socialMedia && data.socialMedia.total > 0) {
        const total = data.socialMedia.total;
        if (total >= 1000) {
            scores.socialScore = 100;
        } else if (total >= 500) {
            scores.socialScore = 85;
        } else if (total >= 100) {
            scores.socialScore = 70;
        } else if (total >= 50) {
            scores.socialScore = 55;
        } else if (total >= 10) {
            scores.socialScore = 35;
        } else {
            scores.socialScore = 15;
        }
    }

    scores.rankingScore = Math.round(rankingScore);

    // Calculate weighted total
    scores.total = Math.round(
        (scores.seoScore * 0.25) +
        (scores.rankingScore * 0.30) +
        (scores.mentionsScore * 0.20) +
        (scores.socialScore * 0.25)
    );

    return scores;
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
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('🔎 מחלץ מידע...');
        const data = await page.evaluate(() => {
            const title = document.querySelector('title')?.textContent || '';
            const h1 = document.querySelector('h1')?.textContent || '';
            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
            const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
            const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
            const viewport = document.querySelector('meta[name="viewport"]')?.content || '';
            const bodyText = (document.body.innerText || document.body.textContent || '').substring(0, 50000);

            // Check for structured data
            const jsonLd = document.querySelector('script[type="application/ld+json"]');
            const hasStructuredData = !!jsonLd;

            return {
                title,
                h1,
                description: metaDesc || ogDesc,
                bodyText,
                hasHttps: window.location.protocol === 'https:',
                hasOpenGraph: !!(ogTitle || ogDesc),
                hasStructuredData,
                hasCanonical: !!canonical,
                hasMobileViewport: !!viewport
            };
        });

        await browser.close();
        browser = null;

        const urlObj = new URL(url);
        const analysis = analyzeData(data, urlObj);

        // Analyze SEO
        console.log('📊 מנתח SEO...');
        const seoAnalysis = analyzeSEO(data, url);
        analysis.seo = seoAnalysis;

        // Search for Google ranking
        console.log('🔍 מחפש דירוג בגוגל...');
        const googleRanking = await analyzeGoogleRanking(url, analysis.fontName);
        analysis.googleRanking = googleRanking;

        // Search for social media mentions
        console.log('🌐 מחפש אזכורים ברשתות חברתיות...');
        const socialMedia = await searchSocialMediaMentions(analysis.fontName);
        analysis.socialMedia = socialMedia;

        // Search for backlinks (pages linking to this font page)
        console.log('🔗 מחפש קישורים חוזרים...');
        const backlinks = await searchBacklinks(url);
        analysis.backlinks = backlinks;

        // Calculate new comprehensive score
        console.log('🎯 מחשב ציון סופי...');
        const finalScore = calculateFinalScore({
            seoScore: seoAnalysis.score,
            googleRanking: googleRanking,
            socialMedia: socialMedia,
            weights: analysis.weights,
            features: analysis.features
        });

        analysis.scores.final = finalScore.total;
        analysis.scores.seoScore = finalScore.seoScore;
        analysis.scores.rankingScore = finalScore.rankingScore;
        analysis.scores.socialScore = finalScore.socialScore;
        analysis.scores.mentionsScore = finalScore.mentionsScore;

        // Rule-based intelligent analysis
        console.log('🤖 מפעיל ניתוח חכם...');

        // Analyze page content quality
        const contentAnalysis = analyzeContentWithGPT(data, analysis.fontName);
        analysis.contentAnalysis = contentAnalysis;

        // Analyze sentiment of social mentions
        const allSources = [
            ...(socialMedia.sources || []),
            ...(googleRanking.sources || [])
        ];
        const sentimentAnalysis = analyzeMentionsSentiment(allSources, analysis.fontName);
        analysis.sentimentAnalysis = sentimentAnalysis;

        // Generate overall summary and recommendations
        const aiSummary = generateSummaryAndRecommendations(analysis, analysis.fontName);
        analysis.aiSummary = aiSummary;

        console.log('✅ ניתוח חכם הושלם');

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

    // Extract font name from H1 or Title, prioritizing H1
    let fontName = data.h1 || data.title;

    // Split by common separators and take the first part
    fontName = fontName.split('|')[0].split('-')[0].split('–')[0].split(':')[0].trim();

    // Remove common prefixes like "פונט", "font", "גופן" from the beginning
    fontName = fontName.replace(/^(פונט|font|גופן)\s+/i, '').trim();

    // Remove "font", "typeface" from the end
    fontName = fontName.replace(/\s+(font|typeface|פונט|גופן)$/i, '').trim();

    // Remove Hebrew diacritics (nikud), special characters and extra spaces
    fontName = fontName.replace(/[\u0591-\u05C7]/g, '').replace(/[+]/g, '').replace(/\s+/g, ' ').trim();

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
