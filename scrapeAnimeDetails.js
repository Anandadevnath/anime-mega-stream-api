import puppeteer from 'puppeteer';
import pLimit from 'p-limit';
import { saveStreamingLink, saveBulkStreamingLinks } from './database/services/streamingLinkService.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeAnimeDetails = async (animeUrl) => {
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

    const maxConcurrency = 8;
    const pagePool = [];

    for (let i = 0; i < maxConcurrency; i++) {
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();

            if (['image', 'font', 'media', 'websocket', 'manifest'].includes(resourceType) ||
                url.includes('.jpg') ||
                url.includes('.png') ||
                url.includes('.gif') ||
                url.includes('.webp') ||
                url.includes('.svg') ||
                url.includes('.ico') ||
                url.includes('.mp4') ||
                url.includes('.mp3') ||
                url.includes('.css') ||
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
                url.includes('googlesyndication')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        pagePool.push(page);
    }

    try {
        const mainPage = pagePool[0];

        console.log(`🔍 Loading anime details from: ${animeUrl}`);
        await mainPage.goto(animeUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        await delay(3000);

        const animeInfo = await mainPage.evaluate(() => {
            const titleSelectors = [
                '.entry-title',
                '.anime-title',
                'h1.title',
                '.infoz h1',
                'h1',
                '.post-title'
            ];

            let title = null;
            for (const selector of titleSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    title = element.textContent.trim();
                    break;
                }
            }

            if (!title) {
                const urlParts = window.location.pathname.split('/');
                const animeName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
                title = animeName ? animeName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown Anime';
            }

            let posterImage = null;
            const imageSelectors = [
                '.thumb img',
                '.poster img',
                '.anime-poster img',
                '.detail-poster img',
                'img[src*="poster"]',
                'img[src*="cover"]'
            ];

            for (const selector of imageSelectors) {
                const img = document.querySelector(selector);
                if (img && img.src && !img.src.includes('no_poster')) {
                    posterImage = img.src;
                    break;
                }
            }

            return { title, posterImage };
        });

        console.log(`📺 Anime Title: ${animeInfo.title}`);
        if (animeInfo.posterImage) {
            console.log(`🖼️ Found poster image: ${animeInfo.posterImage}`);
        }

        console.log('🔄 Attempting to load all episode ranges...');
        await mainPage.evaluate(() => {
            const rangeButtons = document.querySelectorAll('button[data-range], .range-btn, .load-more, .show-more, [onclick*="range"], [onclick*="load"]');
            console.log(`Found ${rangeButtons.length} potential range/load buttons`);

            rangeButtons.forEach((button, index) => {
                try {
                    console.log(`Clicking button ${index + 1}: ${button.textContent.trim()}`);
                    button.click();
                } catch (e) {
                    console.log(`Failed to click button ${index + 1}: ${e.message}`);
                }
            });

            document.dispatchEvent(new Event('DOMContentLoaded'));
            window.dispatchEvent(new Event('load'));
        });

        await delay(5000);

        const allEpisodes = await mainPage.evaluate(() => {
            const allEpisodeLinks = [];

            console.log('\n🔍 ENHANCED EPISODE DETECTION FOR ACTUAL EPISODES');
            console.log('='.repeat(60));
            console.log(`Current URL: ${window.location.href}`);
            console.log(`Page title: ${document.title}`);

            console.log('\n🔍 Strategy 1: Looking for episode ranges...');
            const rangeSelectors = [
                '.episodes.range',
                '.episodes[data-range]',
                '.episode-range',
                '[class*="range"]',
                '.episodes[style*="block"]',
                '.episodes:not([style*="none"])'
            ];

            let allRanges = [];
            rangeSelectors.forEach(selector => {
                const ranges = document.querySelectorAll(selector);
                console.log(`Selector "${selector}": Found ${ranges.length} ranges`);
                ranges.forEach(range => {
                    if (!allRanges.includes(range)) {
                        allRanges.push(range);
                    }
                });
            });

            console.log(`Found ${allRanges.length} total episode ranges`);

            allRanges.forEach((rangeContainer, rangeIndex) => {
                console.log(`\nRange ${rangeIndex + 1}:`);
                console.log(`  Class: ${rangeContainer.className}`);
                console.log(`  Style: ${rangeContainer.getAttribute('style') || 'none'}`);
                console.log(`  Data attributes: ${Array.from(rangeContainer.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')}`);

                const rangeId = rangeContainer.getAttribute('data-range-id') ||
                    rangeContainer.getAttribute('data-range') ||
                    rangeIndex.toString();

                const episodeAnchors = rangeContainer.querySelectorAll('li a[href], a[href]');
                console.log(`  Found ${episodeAnchors.length} episode links`);

                episodeAnchors.forEach((anchor, anchorIndex) => {
                    const episodeNumber = anchor.textContent.trim();
                    const episodeUrl = anchor.href;
                    const dataId = anchor.getAttribute('data-id');

                    if (anchorIndex < 3) {
                        console.log(`    Episode ${anchorIndex + 1}: "${episodeNumber}" -> ${episodeUrl}`);
                    }

                    if (episodeUrl &&
                        (episodeUrl.includes('episode') ||
                            episodeUrl.includes('/ep-') ||
                            episodeUrl.includes('/ep/') ||
                            /\/\d+\/?$/.test(episodeUrl) ||
                            episodeUrl.includes(window.location.pathname))) {

                        const episodeNumberMatch = episodeNumber.match(/(\d+)/);
                        if (episodeNumberMatch) {
                            const epNum = parseInt(episodeNumberMatch[1]);

                            if (epNum >= 1 && epNum <= 2000) {
                                allEpisodeLinks.push({
                                    episode_number: episodeNumber,
                                    episode_url: episodeUrl,
                                    data_id: dataId,
                                    range_id: rangeId,
                                    range_index: rangeIndex + 1,
                                    strategy: 'range',
                                    episode_num: epNum
                                });
                            } else {
                                console.log(`    Filtered out invalid episode number: ${episodeNumber} (${epNum})`);
                            }
                        }
                    }
                });
            });

            if (allEpisodeLinks.length === 0) {
                console.log('\n🔍 Strategy 2: Looking for single episode container...');
                const episodeContainers = document.querySelectorAll('.episodes, .episode-list, .eps-list, .eplister');

                episodeContainers.forEach((container, containerIndex) => {
                    console.log(`Container ${containerIndex + 1}: Class="${container.className}"`);
                    const episodeAnchors = container.querySelectorAll('li a[href], a[href]');
                    console.log(`  Found ${episodeAnchors.length} episode links`);

                    episodeAnchors.forEach((anchor, index) => {
                        const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                        const episodeUrl = anchor.href;

                        if (index < 3) {
                            console.log(`    Episode ${index + 1}: "${episodeNumber}" -> ${episodeUrl}`);
                        }

                        if (episodeUrl &&
                            (episodeUrl.includes('episode') ||
                                episodeUrl.includes('/ep-') ||
                                episodeUrl.includes('/ep/') ||
                                /\/\d+\/?$/.test(episodeUrl))) {

                            const episodeNumberMatch = episodeNumber.match(/(\d+)/);
                            if (episodeNumberMatch) {
                                const epNum = parseInt(episodeNumberMatch[1]);

                                if (epNum >= 1 && epNum <= 2000) {
                                    allEpisodeLinks.push({
                                        episode_number: episodeNumber,
                                        episode_url: episodeUrl,
                                        data_id: anchor.getAttribute('data-id'),
                                        range_id: `container-${containerIndex}`,
                                        range_index: containerIndex + 1,
                                        strategy: 'container',
                                        episode_num: epNum
                                    });
                                }
                            }
                        }
                    });
                });
            }

            if (allEpisodeLinks.length === 0) {
                console.log('\n🔍 Strategy 3: Direct episode link search...');
                const directSelectors = [
                    'a[href*="episode"]',
                    'a[href*="/ep-"]',
                    'a[href*="/ep/"]',
                    'a[href*="/episode/"]',
                    '.episode-link',
                    '.ep-link'
                ];

                directSelectors.forEach(selector => {
                    const episodeAnchors = document.querySelectorAll(selector);
                    console.log(`Selector "${selector}": Found ${episodeAnchors.length} episode links`);

                    if (episodeAnchors.length > 0) {
                        Array.from(episodeAnchors).slice(0, 5).forEach((anchor, index) => {
                            console.log(`  Sample ${index + 1}: "${anchor.textContent.trim()}" -> ${anchor.href}`);
                        });

                        episodeAnchors.forEach((anchor, index) => {
                            const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                            const episodeUrl = anchor.href;

                            const exists = allEpisodeLinks.some(ep => ep.episode_url === episodeUrl);

                            if (!exists && episodeUrl &&
                                (episodeUrl.includes('episode') ||
                                    episodeUrl.includes('/ep-') ||
                                    episodeUrl.includes('/ep/') ||
                                    /\/\d+\/?$/.test(episodeUrl))) {

                                const episodeNumberMatch = episodeNumber.match(/(\d+)/);
                                if (episodeNumberMatch) {
                                    const epNum = parseInt(episodeNumberMatch[1]);

                                    if (epNum >= 1 && epNum <= 2000) {
                                        allEpisodeLinks.push({
                                            episode_number: episodeNumber,
                                            episode_url: episodeUrl,
                                            data_id: anchor.getAttribute('data-id'),
                                            range_id: 'direct',
                                            range_index: 1,
                                            strategy: 'direct',
                                            episode_num: epNum
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
            }

            const uniqueEpisodes = [];
            const seenUrls = new Set();
            const seenEpisodeNumbers = new Set();

            allEpisodeLinks.forEach(episode => {
                const url = episode.episode_url;
                const epNum = episode.episode_num;

                if (!seenUrls.has(url) && !seenEpisodeNumbers.has(epNum)) {
                    seenUrls.add(url);
                    seenEpisodeNumbers.add(epNum);
                    uniqueEpisodes.push(episode);
                } else {
                    console.log(`Filtered duplicate: Episode ${episode.episode_number} (${url})`);
                }
            });

            const sortedEpisodes = uniqueEpisodes.sort((a, b) => {
                return a.episode_num - b.episode_num;
            });

            console.log('\n📊 EPISODE DETECTION RESULTS:');
            console.log('='.repeat(40));
            console.log(`Raw episodes found: ${allEpisodeLinks.length}`);
            console.log(`After deduplication: ${sortedEpisodes.length}`);
            console.log(`Episode range: ${sortedEpisodes.length > 0 ? `${sortedEpisodes[0].episode_num} - ${sortedEpisodes[sortedEpisodes.length - 1].episode_num}` : 'None'}`);

            if (sortedEpisodes.length > 0) {
                const strategyBreakdown = {};
                sortedEpisodes.forEach(ep => {
                    strategyBreakdown[ep.strategy] = (strategyBreakdown[ep.strategy] || 0) + 1;
                });

                console.log('Episodes by strategy:');
                Object.entries(strategyBreakdown).forEach(([strategy, count]) => {
                    console.log(`  ${strategy}: ${count} episodes`);
                });

                console.log('\nFirst 5 episodes:');
                sortedEpisodes.slice(0, 5).forEach(ep => {
                    console.log(`  Episode ${ep.episode_number}: ${ep.episode_url}`);
                });

                if (sortedEpisodes.length > 10) {
                    console.log('\nLast 5 episodes:');
                    sortedEpisodes.slice(-5).forEach(ep => {
                        console.log(`  Episode ${ep.episode_number}: ${ep.episode_url}`);
                    });
                }
            }

            console.log('='.repeat(40));

            return sortedEpisodes;
        });

        console.log(`📺 Found ${allEpisodes.length} actual episodes to process`);

        if (allEpisodes.length > 1200) {
            console.log('⚠️  WARNING: Very high episode count detected. This might indicate duplicate detection.');
            console.log('First 10 episodes:');
            allEpisodes.slice(0, 10).forEach(ep => {
                console.log(`  Episode ${ep.episode_number}: ${ep.episode_url}`);
            });
            console.log('Last 10 episodes:');
            allEpisodes.slice(-10).forEach(ep => {
                console.log(`  Episode ${ep.episode_number}: ${ep.episode_url}`);
            });
        }

        if (allEpisodes.length === 0) {
            console.log('❌ No actual episodes found. Checking page structure...');
            return [];
        }

        const streamingLinks = [];
        const batchSize = maxConcurrency;
        const limit = pLimit(maxConcurrency);

        const extractEpisodeIframe = async (episode, pageIndex) => {
            const page = pagePool[pageIndex % pagePool.length];
            let attempts = 0;
            const maxNavigationAttempts = 2;

            while (attempts < maxNavigationAttempts) {
                attempts++;

                try {
                    console.log(`🔗 Processing Episode ${episode.episode_number} (Attempt ${attempts}/${maxNavigationAttempts})...`);

                    await page.goto(episode.episode_url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    });

                    await delay(1500);

                    let streamingLink = null;
                    let iframeAttempts = 0;
                    const maxIframeAttempts = 2;

                    while (!streamingLink && iframeAttempts < maxIframeAttempts) {
                        iframeAttempts++;
                        console.log(`      🔍 Iframe attempt ${iframeAttempts}/${maxIframeAttempts} for Episode ${episode.episode_number}...`);

                        streamingLink = await page.evaluate(() => {
                            const findValidIframeSource = () => {
                                const blockedDomains = [
                                    'dtscout.com',
                                    'google.com',
                                    'googletagmanager.com',
                                    'doubleclick.net',
                                    'googlesyndication.com',
                                    'googleadservices.com',
                                    'adsystem.com',
                                    'recaptcha',
                                    'facebook.com',
                                    'twitter.com',
                                    'instagram.com',
                                    'ads',
                                    'ad-',
                                    'analytics',
                                    'tracking',
                                    'about:blank'
                                ];

                                const validStreamingPatterns = [
                                    'bunnycdn',
                                    'embed',
                                    'play',
                                    'stream',
                                    'video',
                                    'player',
                                    'vidsrc',
                                    'vidplay',
                                    'filemoon',
                                    'doodstream',
                                    'streamtape',
                                    'mp4upload',
                                    'mixdrop',
                                    'upstream',
                                    'streamwish',
                                    'vid',
                                    'watch'
                                ];

                                const isValidStreamingLink = (src) => {
                                    if (!src || src === 'about:blank' || !src.startsWith('http') || src.length < 25) {
                                        return false;
                                    }

                                    const isBlocked = blockedDomains.some(domain =>
                                        src.toLowerCase().includes(domain.toLowerCase())
                                    );

                                    if (isBlocked) {
                                        return false;
                                    }

                                    const isValidStreaming = validStreamingPatterns.some(pattern =>
                                        src.toLowerCase().includes(pattern.toLowerCase())
                                    );

                                    return isValidStreaming;
                                };

                                const prioritySelectors = [
                                    '#iframe_ext82377 iframe',
                                    'iframe[src*="bunnycdn"]',
                                    'iframe[src*="embed"]',
                                    'iframe[src*="play"]',
                                    'iframe[src*="stream"]',
                                    'iframe[src*="video"]',
                                    'iframe[src*="player"]',
                                    'iframe[src*="vid"]'
                                ];

                                for (const selector of prioritySelectors) {
                                    const iframe = document.querySelector(selector);
                                    if (iframe && iframe.src && isValidStreamingLink(iframe.src)) {
                                        console.log(`✅ Found valid iframe with priority selector: ${selector}`);
                                        return iframe.src;
                                    }
                                }

                                const iframes = document.querySelectorAll('iframe');
                                console.log(`🔍 Scanning ${iframes.length} total iframes`);

                                for (const iframe of iframes) {
                                    const src = iframe.src ||
                                        iframe.getAttribute('src') ||
                                        iframe.getAttribute('data-src') ||
                                        iframe.getAttribute('data-lazy') ||
                                        iframe.getAttribute('data-original');

                                    if (src && isValidStreamingLink(src)) {
                                        console.log(`✅ Found valid streaming iframe: ${src.substring(0, 60)}...`);
                                        return src;
                                    }
                                }

                                return null;
                            };

                            return findValidIframeSource();
                        });

                        if (!streamingLink && iframeAttempts < maxIframeAttempts) {
                            console.log(`      🔄 No iframe found, trying to trigger loading...`);

                            await page.evaluate(() => {
                                const buttons = document.querySelectorAll('button, .play-btn, .load-btn, [onclick], .btn, .play-button');
                                for (const btn of buttons) {
                                    const text = btn.textContent?.toLowerCase() || '';
                                    if (text.includes('play') || text.includes('load') || text.includes('watch') || text.includes('server')) {
                                        try {
                                            console.log(`🖱️ Clicking button: ${text.substring(0, 20)}`);
                                            btn.click();
                                            break;
                                        } catch (e) {

                                        }
                                    }
                                }
                            });

                            await delay(1000 + (iframeAttempts * 300));
                        }
                    }

                    if (streamingLink) {
                        console.log(`      ✅ Found iframe for Episode ${episode.episode_number}: ${streamingLink.substring(0, 50)}...`);
                        
                        const streamingData = {
                            title: animeInfo.title,
                            episode_number: episode.episode_number,
                            episode_url: episode.episode_url,
                            streaming_link: streamingLink,
                            image: animeInfo.posterImage,
                            range_id: episode.range_id,
                            strategy: episode.strategy,
                            source: '123animes'
                        };

                        // 🚀 AUTO-SAVE TO DATABASE IMMEDIATELY AFTER PROCESSING
                        try {
                            await saveStreamingLink(streamingData);
                            console.log(`      💾 Saved to database: ${animeInfo.title} - Episode ${episode.episode_number}`);
                        } catch (saveError) {
                            console.error(`      ❌ Failed to save to database: ${animeInfo.title} - Episode ${episode.episode_number} - ${saveError.message}`);
                        }

                        return streamingData;
                    } else {
                        console.log(`      ❌ No valid iframe found for Episode ${episode.episode_number} after ${maxIframeAttempts} attempts`);

                        if (attempts >= maxNavigationAttempts) {
                            return null;
                        }

                        console.log(`      🔄 Retrying navigation for Episode ${episode.episode_number}...`);
                        await delay(800);
                        continue;
                    }

                } catch (error) {
                    console.log(`      ❌ Navigation error for Episode ${episode.episode_number} (attempt ${attempts}): ${error.message}`);

                    if (attempts >= maxNavigationAttempts) {
                        return null;
                    }

                    await delay(1000);
                }
            }

            return null;
        };

        console.log(`🎬 Processing all ${allEpisodes.length} actual episodes with ${maxConcurrency} concurrent workers...`);

        for (let i = 0; i < allEpisodes.length; i += batchSize) {
            const batch = allEpisodes.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(allEpisodes.length / batchSize);

            console.log(`🚀 Processing batch ${batchNumber}/${totalBatches}: Episodes ${i + 1}-${Math.min(i + batchSize, allEpisodes.length)}`);

            const batchPromises = batch.map((episode, batchIndex) =>
                limit(() => extractEpisodeIframe(episode, i + batchIndex))
            );

            const batchResults = await Promise.all(batchPromises);

            const validResults = batchResults.filter(result => result !== null);
            streamingLinks.push(...validResults);

            const successRate = ((validResults.length / batch.length) * 100).toFixed(1);
            console.log(`✅ Batch ${batchNumber} completed: ${validResults.length}/${batch.length} episodes successful (${successRate}%)`);
            console.log(`📊 Total episodes processed so far: ${streamingLinks.length}/${allEpisodes.length}`);

            const progressPercent = ((streamingLinks.length / allEpisodes.length) * 100).toFixed(1);
            console.log(`📈 Overall progress: ${progressPercent}% complete`);

            const delayTime = validResults.length > batch.length * 0.7 ? 800 : 1500;
            if (i + batchSize < allEpisodes.length) {
                await delay(delayTime);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('📋 FINAL RESULTS - ACTUAL EPISODES ONLY');
        console.log('='.repeat(80));
        console.log(`📺 Anime: ${animeInfo.title}`);
        console.log(`🎯 Actual episodes found: ${allEpisodes.length}`);
        console.log(`✅ Successfully extracted: ${streamingLinks.length}/${allEpisodes.length} episodes`);
        console.log(`❌ Failed episodes: ${allEpisodes.length - streamingLinks.length}`);
        console.log(`📈 Success rate: ${((streamingLinks.length / allEpisodes.length) * 100).toFixed(1)}%`);
        console.log(`💾 Database saves: ${streamingLinks.length} streaming links saved`);

        const strategyBreakdown = {};
        streamingLinks.forEach(link => {
            strategyBreakdown[link.strategy] = (strategyBreakdown[link.strategy] || 0) + 1;
        });
        console.log('📊 Success by strategy:', strategyBreakdown);
        console.log('='.repeat(80));

        return streamingLinks;

    } catch (error) {
        console.error('❌ Error scraping anime details:', error.message);
        return [];
    } finally {
        await Promise.all(pagePool.map(page => page.close()));
        await browser.close();
    }
};