import puppeteer from 'puppeteer';
import pLimit from 'p-limit';
import { saveStreamingLink } from '../database/services/streamingLinkService.js';
import { getAnimeList } from '../database/services/animeService.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Batch scrape streaming links for a range of anime (by index)
export const scrapeAnimeDetailsBatch = async (start = 0, limit = 10) => {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu',
            '--no-first-run'
        ]
    });

    try {
        // Fetch anime list from DB, skip 'start', get 'limit'
        const animeList = await getAnimeList(limit, start);
        if (!animeList || animeList.length === 0) {
            console.log('No anime found for this batch.');
            return [];
        }

        for (let i = 0; i < animeList.length; i++) {
            const anime = animeList[i];
            console.log(`\n=== [${start + i + 1}] ${anime.title} ===`);
            await scrapeAnimeDetails(anime.anime_redirect_link, anime.title, browser);
            await delay(2000); // polite delay between anime
        }
    } finally {
        await browser.close();
    }
};

// Scrape streaming links for a single anime
export const scrapeAnimeDetails = async (animeUrl, animeTitle, browser) => {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();
        if (
            ['image', 'font', 'media', 'websocket', 'manifest'].includes(resourceType) ||
            url.match(/\.(jpg|png|gif|webp|svg|ico|mp4|mp3|css)$/i) ||
            url.includes('google-analytics') ||
            url.includes('googletagmanager') ||
            url.includes('facebook.com') ||
            url.includes('twitter.com') ||
            url.includes('instagram.com') ||
            url.includes('tiktok.com') ||
            url.includes('ads') ||
            url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('doubleclick') ||
            url.includes('googlesyndication')
        ) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.goto(animeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await delay(3000);

        // Try to load all episode ranges
        await page.evaluate(() => {
            const rangeButtons = document.querySelectorAll('button[data-range], .range-btn, .load-more, .show-more, [onclick*="range"], [onclick*="load"]');
            rangeButtons.forEach(btn => { try { btn.click(); } catch {} });
        });
        await delay(4000);

        // Get all episode links
        const episodes = await page.evaluate(() => {
            const links = [];
            const selectors = [
                '.episodes.range a[href]',
                '.episode-list a[href]',
                '.eps-list a[href]',
                '.eplister a[href]',
                'a[href*="episode"]',
                'a[href*="/ep-"]',
                'a[href*="/ep/"]',
                'a[href*="/episode/"]'
            ];
            const seen = new Set();
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(a => {
                    const url = a.href;
                    const text = a.textContent.trim();
                    if (url && !seen.has(url) && /\d/.test(text)) {
                        seen.add(url);
                        links.push({ episode_number: text, episode_url: url });
                    }
                });
            });
            return links;
        });

        console.log(`Found ${episodes.length} episodes.`);

        // Limit concurrency for episode scraping
        const limit = pLimit(5);
        await Promise.all(episodes.map((ep, idx) =>
            limit(async () => {
                const epPage = await browser.newPage();
                await epPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await epPage.setRequestInterception(true);
                epPage.on('request', (req) => {
                    const resourceType = req.resourceType();
                    const url = req.url();
                    if (
                        ['image', 'font', 'media', 'websocket', 'manifest'].includes(resourceType) ||
                        url.match(/\.(jpg|png|gif|webp|svg|ico|mp4|mp3|css)$/i) ||
                        url.includes('google-analytics') ||
                        url.includes('googletagmanager') ||
                        url.includes('facebook.com') ||
                        url.includes('twitter.com') ||
                        url.includes('instagram.com') ||
                        url.includes('tiktok.com') ||
                        url.includes('ads') ||
                        url.includes('analytics') ||
                        url.includes('tracking') ||
                        url.includes('doubleclick') ||
                        url.includes('googlesyndication')
                    ) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
                try {
                    await epPage.goto(ep.episode_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await delay(1500);
                    const streamingLink = await epPage.evaluate(() => {
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        for (const iframe of iframes) {
                            const src = iframe.src || iframe.getAttribute('src');
                            if (src && src.startsWith('http') && !src.includes('about:blank')) {
                                return src;
                            }
                        }
                        return null;
                    });
                    if (streamingLink) {
                        await saveStreamingLink({
                            title: animeTitle,
                            episode_number: ep.episode_number,
                            episode_url: ep.episode_url,
                            streaming_link: streamingLink,
                            source: '123animes'
                        });
                        console.log(`Saved streaming link for episode ${ep.episode_number}`);
                    } else {
                        console.log(`No streaming link found for episode ${ep.episode_number}`);
                    }
                } catch (err) {
                    console.log(`Error scraping episode ${ep.episode_number}: ${err.message}`);
                } finally {
                    await epPage.close();
                }
            })
        ));
    } catch (err) {
        console.log(`Error scraping anime: ${err.message}`);
    } finally {
        await page.close();
    }
};