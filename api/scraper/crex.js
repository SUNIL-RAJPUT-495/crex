import puppeteer from 'puppeteer';

let browserPromise = null;

// Helper to launch browser depending on environment (Local vs Serverless/Vercel)
async function getBrowser() {
    if (browserPromise) {
        try {
            const browser = await browserPromise;
            if (browser && browser.connected) {
                return browser;
            }
        } catch (e) {
            console.error("Existing browser promise failed, resetting...", e);
            browserPromise = null;
        }
    }

    browserPromise = (async () => {
        const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
        let browser;
        
        if (isServerless) {
            console.log("Serverless environment detected. Loading puppeteer-core and @sparticuz/chromium-min...");
            const { default: puppeteerCore } = await import('puppeteer-core');
            const { default: chromium } = await import('@sparticuz/chromium-min');
            
            const chromiumPackUrl = 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';
            
            browser = await puppeteerCore.launch({
                args: [...chromium.args, '--disable-gpu', '--disable-dev-shm-usage'],
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(chromiumPackUrl),
                headless: chromium.headless,
            });
        } else {
            console.log("Local environment detected. Launching local Puppeteer browser...");
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-accelerated-2d-canvas'
                ]
            });
        }

        browser.on('disconnected', () => {
            console.log("Puppeteer browser disconnected. Clearing persistent instance promise.");
            browserPromise = null;
        });

        return browser;
    })();

    return browserPromise;
}

// Helper to set up page level optimizations
async function setupPageOptimizations(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();
        
        if (
            resourceType === 'image' ||
            resourceType === 'font' ||
            resourceType === 'media' ||
            url.includes('google-analytics') ||
            url.includes('doubleclick') ||
            url.includes('adsystem') ||
            url.includes('adnxs') ||
            url.includes('facebook') ||
            url.includes('optimizely') ||
            url.includes('hotjar') ||
            url.includes('amazon-adsystem') ||
            (url.includes('google') && (url.includes('ads') || url.includes('syndication')))
        ) {
            req.abort();
        } else {
            req.continue();
        }
    });
}

export async function scrapeAllMatches() {
    console.log("Fetching persistent browser for scrapeAllMatches...");
    const browser = await getBrowser();
    let page;
    try {
        page = await browser.newPage();
        await setupPageOptimizations(page);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("Navigating to crex.com/schedule...");
        await page.goto('https://crex.com/schedule', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForSelector('.date-wise-matches-card', { timeout: 15000 });

        const result = await page.evaluate(() => {
            const datewiseWrap = document.querySelector('.date-wise-matches-card');
            if (!datewiseWrap) return [];

            const dateBlocks = datewiseWrap.children;
            const data = [];

            Array.from(dateBlocks).forEach((block) => {
                const dateHeader = block.querySelector('h2.date');
                if (!dateHeader) return;
                
                const dateStr = dateHeader.textContent.trim();
                const matchWrappers = block.querySelectorAll('.match-card-wrapper');
                const matches = [];

                matchWrappers.forEach((w) => {
                    const href = w.getAttribute('href') || '';
                    const slug = href.replace('/cricket-live-score/', '');
                    const matchId = slug.split('-').pop() || '';

                    // Team names
                    const teamElements = w.querySelectorAll('.team-name');
                    const team1 = teamElements[0] ? teamElements[0].textContent.trim() : '';
                    const team2 = teamElements[1] ? teamElements[1].textContent.trim() : '';

                    // Scores
                    const scoreElements = w.querySelectorAll('.team-score');
                    const score1 = scoreElements[0] ? scoreElements[0].textContent.trim() : '';
                    const score2 = scoreElements[1] ? scoreElements[1].textContent.trim() : '';

                    // Overs
                    const overElements = w.querySelectorAll('.total-overs');
                    const overs1 = overElements[0] ? overElements[0].textContent.trim() : '';
                    const overs2 = overElements[1] ? overElements[1].textContent.trim() : '';

                    // Logos
                    const imgElements = w.querySelectorAll('img');
                    const logo1 = imgElements[0] ? imgElements[0].src : '';
                    const logo2 = imgElements[1] ? imgElements[1].src : '';

                    // Match Status/Result/Time
                    const resultText = w.querySelector('.result')?.textContent.trim();
                    const reasonText = w.querySelector('.reason')?.textContent.trim();
                    const liveTag = w.querySelector('.liveTag')?.textContent.trim();
                    const startTime = w.querySelector('.start-text')?.textContent.trim() || w.querySelector('.time')?.textContent.trim() || '';

                    let status = 'UPCOMING';
                    let resultMessage = '';
                    if (liveTag) {
                        status = 'LIVE';
                    } else if (resultText) {
                        status = 'FINISHED';
                        resultMessage = resultText;
                    }

                    matches.push({
                        matchId,
                        slug,
                        team1: { name: team1, score: score1, overs: overs1, logo: logo1 },
                        team2: { name: team2, score: score2, overs: overs2, logo: logo2 },
                        status,
                        startTime,
                        result: resultMessage,
                        reason: reasonText || '',
                        href: href ? 'https://crex.com' + href : ''
                    });
                });

                data.push({
                    date: dateStr,
                    matches
                });
            });

            return data;
        });

        return result;
    } finally {
        if (page) await page.close();
    }
}

export async function scrapeMatchDetails(slug) {
    const fullUrl = `https://crex.com/cricket-live-score/${slug}`;
    console.log(`Fetching persistent browser for scrapeMatchDetails: ${fullUrl}`);
    const browser = await getBrowser();
    let page;
    try {
        page = await browser.newPage();
        await setupPageOptimizations(page);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for key selectors to load to ensure Angular has fully rendered
        try {
            await page.waitForSelector('.live-score-card, .fixture-page-title, .not-started', { timeout: 12000 });
        } catch (e) {
            console.log("Timeout waiting for scorecard or fixture page title, proceeding with evaluate...");
        }

        const parsedData = await page.evaluate((matchSlug) => {
            const liveScoreCard = document.querySelector('.live-score-card');
            
            // Extract match ID from slug
            const matchId = matchSlug.split('-').pop() || '';

            // 1. Parse Live Score Card Details
            let team1 = { name: '', score: '', overs: '', logo: '' };
            let team2 = { name: '', score: '', overs: '', logo: '' };
            let crr = '';
            let rrr = '';
            let targetInfo = '';
            let status = 'UPCOMING';
            let resultMessage = '';

            if (liveScoreCard) {
                // Team 1 runs & overs
                const team1NameEl = liveScoreCard.querySelector('.team-name.team-1');
                const team1ImgEl = liveScoreCard.querySelector('.team-inning:not(.second-inning) img');
                const team1RunsSpan = liveScoreCard.querySelector('.team-inning:not(.second-inning) .runs.f-runs span:first-child');
                const team1OversSpan = liveScoreCard.querySelector('.team-inning:not(.second-inning) .runs.f-runs span:nth-child(2)');

                team1 = {
                    name: team1NameEl ? team1NameEl.textContent.replace(/\s+/g, ' ').trim() : '',
                    score: team1RunsSpan ? team1RunsSpan.textContent.trim() : '',
                    overs: team1OversSpan ? team1OversSpan.textContent.trim() : '',
                    logo: team1ImgEl ? team1ImgEl.src : ''
                };

                // Team 2 runs & overs / run rate
                const team2NameEl = liveScoreCard.querySelector('.team-name.team-2');
                const team2ImgEl = liveScoreCard.querySelector('.team-inning.second-inning img');
                const team2RunsSpan = liveScoreCard.querySelector('.team-inning.second-inning .runs.f-runs span:first-child');
                const team2OversSpan = liveScoreCard.querySelector('.team-inning.second-inning .runs.f-runs span:nth-child(2)');

                team2 = {
                    name: team2NameEl ? team2NameEl.textContent.replace(/\s+/g, ' ').trim() : '',
                    score: team2RunsSpan ? team2RunsSpan.textContent.trim() : '',
                    overs: team2OversSpan ? team2OversSpan.textContent.trim() : '',
                    logo: team2ImgEl ? team2ImgEl.src : ''
                };

                // Run Rates
                const runRateText = liveScoreCard.querySelector('.team-run-rate')?.textContent || '';
                const crrMatch = runRateText.match(/CRR\s*:\s*([\d.]+)/i);
                const rrrMatch = runRateText.match(/RRR\s*:\s*([\d.]+)/i);
                crr = crrMatch ? crrMatch[1] : '';
                rrr = rrrMatch ? rrrMatch[1] : '';

                // Target
                targetInfo = liveScoreCard.querySelector('.final-result.comment')?.textContent.trim() || 
                             liveScoreCard.querySelector('.final-result.des-none')?.textContent.trim() || '';

                // If score is present, check status
                const finalResultText = document.querySelector('.final-result')?.textContent.trim() || 
                                        document.querySelector('.team-result')?.textContent.trim() || '';
                
                const isLiveMatch = document.querySelector('.live-bar') !== null || 
                                    document.querySelector('.blinking2') !== null ||
                                    document.querySelector('.team-run-rate') !== null;

                const isFinished = finalResultText.toLowerCase().includes('won') || 
                                   finalResultText.toLowerCase().includes('abnd') || 
                                   finalResultText.toLowerCase().includes('abandoned') || 
                                   finalResultText.toLowerCase().includes('no result') || 
                                   finalResultText.toLowerCase().includes('tied') || 
                                   finalResultText.toLowerCase().includes('draw');

                if (isFinished) {
                    status = 'FINISHED';
                    resultMessage = finalResultText;
                } else if (isLiveMatch) {
                    status = 'LIVE';
                    resultMessage = document.querySelector('.team-result .font2')?.textContent.trim() || 
                                    document.querySelector('.team-result')?.textContent.trim() || 
                                    'LIVE';
                } else {
                    status = 'UPCOMING';
                }
            } else {
                // If live score card doesn't exist, we fall back to generic page inspection (e.g. for upcoming matches)
                const titleText = document.querySelector('.fixture-page-title')?.textContent || '';
                const teams = titleText.split('vs').map(t => t.trim());
                team1.name = teams[0] || '';
                team2.name = teams[1] || '';
                status = 'UPCOMING';
            }

            // 2. Parse Batsmen & Bowlers currently playing
            const activeBatsmen = [];
            const activeBowlers = [];

            document.querySelectorAll('.batsmen-partnership').forEach((el) => {
                const isBowler = el.querySelector('.bowler') !== null || el.querySelector('.batsmen-score.bowler') !== null;
                const shortName = el.querySelector('.batsmen-name')?.textContent.trim() || '';
                const fullName = el.querySelector('.p-name, .player-wrapper a, .player-wrapper p')?.textContent.trim() || '';
                const logo = el.querySelector('.playerProfileDefault img')?.src || '';

                if (isBowler) {
                    const figures = el.querySelector('.batsmen-score p')?.textContent.trim() || '';
                    const overs = el.querySelector('.batsmen-score p:nth-child(2)')?.textContent.trim().replace(/[()]/g, '') || '';
                    
                    let econ = '';
                    el.querySelectorAll('.strike-rate').forEach((sr) => {
                        const txt = sr.textContent.trim();
                        if (txt.includes('Econ:')) econ = txt.replace('Econ:', '').trim();
                    });

                    const parts = figures.split('-');
                    const wickets = parts[0] || '0';
                    const runs = parts[1] || '0';

                    activeBowlers.push({
                        shortName,
                        fullName,
                        logo,
                        wickets,
                        runs,
                        overs,
                        economy: econ
                    });
                } else {
                    const runs = el.querySelector('.batsmen-score p')?.textContent.trim() || '0';
                    const balls = el.querySelector('.batsmen-score p:nth-child(2)')?.textContent.trim().replace(/[()]/g, '') || '0';
                    const onStrike = el.querySelector('.circle-strike-icon') !== null;

                    let fours = '0';
                    let sixes = '0';
                    let sr = '0.00';

                    el.querySelectorAll('.strike-rate').forEach((srEl) => {
                        const text = srEl.textContent.trim();
                        if (text.includes('4s:')) fours = text.replace('4s:', '').trim();
                        else if (text.includes('6s:')) sixes = text.replace('6s:', '').trim();
                        else if (text.includes('SR:')) sr = text.replace('SR:', '').trim();
                    });

                    activeBatsmen.push({
                        shortName,
                        fullName,
                        logo,
                        runs,
                        balls,
                        fours,
                        sixes,
                        strikeRate: sr,
                        onStrike
                    });
                }
            });

            // Partnership & Last Wicket
            const pship = document.querySelector('.batsmen-partnership')?.textContent.trim() || '';
            const lastWkt = document.querySelector('.last-wkt, .l-wicket')?.textContent.trim() || '';

            // Recent Overs timeline
            const recentOvers = [];
            const oversTimeline = document.querySelector('.overs-timeline');
            if (oversTimeline) {
                const slides = oversTimeline.querySelectorAll('.overs-slide');
                slides.forEach(slide => {
                    const ballElements = slide.querySelectorAll('.over-ball');
                    const balls = Array.from(ballElements)
                        .map(b => b.textContent.trim())
                        .filter(b => b !== '');
                    
                    const text = slide.textContent || '';
                    const overNumMatch = text.match(/Over\s*(\d+)/i);
                    const overNumber = overNumMatch ? overNumMatch[1] : '';
                    
                    const totalRunsMatch = text.match(/=\s*([\d\w]+)/);
                    const totalRuns = totalRunsMatch ? totalRunsMatch[1] : '';

                    if (overNumber || balls.length > 0) {
                        recentOvers.push({
                            overNumber,
                            balls,
                            totalRuns
                        });
                    }
                });
            }

            return {
                matchId,
                slug: matchSlug,
                team1,
                team2,
                status,
                crr,
                rrr,
                targetInfo,
                result: resultMessage,
                batsmen: activeBatsmen,
                bowlers: activeBowlers,
                partnership: pship,
                lastWicket: lastWkt,
                recentOvers,
                timeline: []
            };
        }, slug);

        return parsedData;
    } finally {
        if (page) await page.close();
    }
}
