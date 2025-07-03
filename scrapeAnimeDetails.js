import { chromium } from 'playwright';
import pLimit from 'p-limit';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeAnimeDetails = async (animeUrl) => {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const maxConcurrency = 6; 
    const pagePool = [];
    
    for (let i = 0; i < maxConcurrency; i++) {
        const page = await context.newPage();
        
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();
            
            if (['image', 'font', 'media'].includes(resourceType) ||
                url.includes('.jpg') ||
                url.includes('.png') ||
                url.includes('.gif') ||
                url.includes('google-analytics') ||
                url.includes('facebook.com') ||
                url.includes('twitter.com')) {
                route.abort();
            } else {
                route.continue();
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
        await delay(2000);
        
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
        
        const allEpisodes = await mainPage.evaluate(() => {
            const allEpisodeLinks = [];
            
            console.log('🔍 Strategy 1: Looking for episode ranges...');
            const allRanges = document.querySelectorAll('.episodes.range');
            console.log(`Found ${allRanges.length} episode ranges`);
            
            allRanges.forEach((rangeContainer, rangeIndex) => {
                const rangeId = rangeContainer.getAttribute('data-range-id');
                const episodeAnchors = rangeContainer.querySelectorAll('li a[href]');
                
                console.log(`Range ${rangeIndex + 1}: Found ${episodeAnchors.length} episodes`);
                
                episodeAnchors.forEach(anchor => {
                    const episodeNumber = anchor.textContent.trim();
                    const episodeUrl = anchor.href;
                    const dataId = anchor.getAttribute('data-id');
                    
                    // More flexible episode detection
                    if (episodeUrl && 
                        (episodeUrl.includes('episode') || 
                         episodeUrl.includes('/ep-') || 
                         episodeUrl.includes('/ep') ||
                         /\/\d+\/?$/.test(episodeUrl))) {
                        
                        allEpisodeLinks.push({
                            episode_number: episodeNumber,
                            episode_url: episodeUrl,
                            data_id: dataId,
                            range_id: rangeId,
                            range_index: rangeIndex + 1,
                            strategy: 'range'
                        });
                    }
                });
            });
            
            if (allEpisodeLinks.length === 0) {
                console.log('🔍 Strategy 2: Looking for episode containers...');
                const episodeContainers = document.querySelectorAll('.episodes, .episode-list, .eps-list');
                
                episodeContainers.forEach((container, containerIndex) => {
                    const episodeAnchors = container.querySelectorAll('li a[href], a[href]');
                    console.log(`Container ${containerIndex + 1}: Found ${episodeAnchors.length} episodes`);
                    
                    episodeAnchors.forEach((anchor, index) => {
                        const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                        const episodeUrl = anchor.href;
                        
                        if (episodeUrl && 
                            (episodeUrl.includes('episode') || 
                             episodeUrl.includes('/ep-') || 
                             episodeUrl.includes('/ep') ||
                             /\/\d+\/?$/.test(episodeUrl))) {
                            
                            allEpisodeLinks.push({
                                episode_number: episodeNumber,
                                episode_url: episodeUrl,
                                data_id: anchor.getAttribute('data-id'),
                                range_id: containerIndex.toString(),
                                range_index: containerIndex + 1,
                                strategy: 'container'
                            });
                        }
                    });
                });
            }
            
            if (allEpisodeLinks.length === 0) {
                console.log('🔍 Strategy 3: Fallback episode search...');
                const fallbackSelectors = [
                    'a[href*="episode"]',
                    'a[href*="/ep-"]',
                    'a[href*="/ep"]',
                    '.episode a',
                    '.ep a'
                ];
                
                fallbackSelectors.forEach(selector => {
                    const episodeAnchors = document.querySelectorAll(selector);
                    console.log(`Selector "${selector}": Found ${episodeAnchors.length} episodes`);
                    
                    episodeAnchors.forEach((anchor, index) => {
                        const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                        const episodeUrl = anchor.href;
                        
                        const exists = allEpisodeLinks.some(ep => ep.episode_url === episodeUrl);
                        
                        if (!exists && episodeUrl && 
                            (episodeUrl.includes('episode') || 
                             episodeUrl.includes('/ep-') || 
                             episodeUrl.includes('/ep') ||
                             /\/\d+\/?$/.test(episodeUrl))) {
                            
                            allEpisodeLinks.push({
                                episode_number: episodeNumber,
                                episode_url: episodeUrl,
                                data_id: anchor.getAttribute('data-id'),
                                range_id: '0',
                                range_index: 1,
                                strategy: 'fallback'
                            });
                        }
                    });
                });
            }
            
            const uniqueEpisodes = allEpisodeLinks.filter((episode, index, self) => 
                index === self.findIndex(ep => ep.episode_url === episode.episode_url)
            );
            
            const sortedEpisodes = uniqueEpisodes.sort((a, b) => {
                const extractNumber = (str) => {
                    const match = str.match(/(\d+\.?\d*)/);
                    return match ? parseFloat(match[1]) : 0;
                };
                
                const numA = extractNumber(a.episode_number);
                const numB = extractNumber(b.episode_number);
                return numA - numB;
            });
            
            console.log(`Total unique episodes found: ${sortedEpisodes.length}`);
            console.log(`Episodes by strategy: Range(${sortedEpisodes.filter(e => e.strategy === 'range').length}), Container(${sortedEpisodes.filter(e => e.strategy === 'container').length}), Fallback(${sortedEpisodes.filter(e => e.strategy === 'fallback').length})`);
            
            return sortedEpisodes;
        });
        
        console.log(`📺 Found ${allEpisodes.length} total episodes to process`);
        
        if (allEpisodes.length === 0) {
            console.log('❌ No episodes found. Checking page structure...');
            return [];
        }
        
        const streamingLinks = [];
        const batchSize = maxConcurrency;
        const limit = pLimit(maxConcurrency);
        
        const extractEpisodeIframe = async (episode, pageIndex) => {
            const page = pagePool[pageIndex % pagePool.length];
            
            try {
                console.log(`🔗 Processing Episode ${episode.episode_number}...`);
                
                await page.goto(episode.episode_url, { 
                    waitUntil: 'networkidle',
                    timeout: 12000
                });
                
                await delay(2000);
                
                let streamingLink = null;
                
                streamingLink = await page.evaluate(() => {
                    const selectors = [
                        '#iframe_ext82377 iframe',
                        'iframe[src*="embed"]',
                        'iframe[src*="play"]',
                        'iframe[src*="stream"]',
                        'iframe[src*="video"]',
                        'iframe[src*="bunnycdn"]'
                    ];
                    
                    for (const selector of selectors) {
                        const iframe = document.querySelector(selector);
                        if (iframe && iframe.src && 
                            iframe.src.length > 20 &&
                            !iframe.src.includes('recaptcha') &&
                            !iframe.src.includes('google.com') &&
                            iframe.src !== 'about:blank') {
                            return iframe.src;
                        }
                    }
                    
                    const iframes = document.querySelectorAll('iframe');
                    for (let iframe of iframes) {
                        if (iframe.src && 
                            iframe.src.length > 20 &&
                            iframe.src.startsWith('http') &&
                            !iframe.src.includes('recaptcha') &&
                            !iframe.src.includes('google.com') &&
                            iframe.src !== 'about:blank') {
                            return iframe.src;
                        }
                    }
                    
                    return null;
                });
                
                if (!streamingLink) {
                    console.log(`    🔄 Waiting for dynamic iframe loading for Episode ${episode.episode_number}...`);
                    await delay(3000);
                    
                    streamingLink = await page.evaluate(() => {
                        const buttons = document.querySelectorAll('button, .play-btn, .load-btn, [onclick]');
                        buttons.forEach(btn => {
                            if (btn.textContent.toLowerCase().includes('play') || 
                                btn.textContent.toLowerCase().includes('load') ||
                                btn.onclick) {
                                try {
                                    btn.click();
                                } catch (e) {}
                            }
                        });
                        
                        const iframes = document.querySelectorAll('iframe');
                        for (let iframe of iframes) {
                            if (iframe.src && 
                                iframe.src.length > 20 &&
                                iframe.src.startsWith('http') &&
                                !iframe.src.includes('recaptcha') &&
                                !iframe.src.includes('google.com') &&
                                iframe.src !== 'about:blank') {
                                return iframe.src;
                            }
                        }
                        
                        return null;
                    });
                }
                
                if (!streamingLink) {
                    console.log(`    🔄 Final attempt for Episode ${episode.episode_number}...`);
                    await delay(4000);
                    
                    streamingLink = await page.evaluate(() => {
                        const iframes = document.querySelectorAll('iframe');
                        for (let iframe of iframes) {
                            const dataSrc = iframe.getAttribute('data-src') || 
                                          iframe.getAttribute('data-lazy') ||
                                          iframe.getAttribute('data-original');
                            
                            if (dataSrc && 
                                dataSrc.length > 20 &&
                                dataSrc.startsWith('http') &&
                                !dataSrc.includes('recaptcha') &&
                                !dataSrc.includes('google.com')) {
                                return dataSrc;
                            }
                            
                            if (iframe.src && 
                                iframe.src.length > 20 &&
                                iframe.src.startsWith('http') &&
                                !iframe.src.includes('recaptcha') &&
                                !iframe.src.includes('google.com') &&
                                iframe.src !== 'about:blank') {
                                return iframe.src;
                            }
                        }
                        
                        const videoSources = document.querySelectorAll('source, video');
                        for (let source of videoSources) {
                            if (source.src && source.src.startsWith('http')) {
                                return source.src;
                            }
                        }
                        
                        return null;
                    });
                }
                
                if (streamingLink) {
                    console.log(`    ✅ Found iframe for Episode ${episode.episode_number}: ${streamingLink.substring(0, 50)}...`);
                    return {
                        title: animeInfo.title,
                        episode_number: episode.episode_number,
                        episode_url: episode.episode_url,
                        streaming_link: streamingLink,
                        image: animeInfo.posterImage,
                        range_id: episode.range_id,
                        strategy: episode.strategy
                    };
                } else {
                    console.log(`    ❌ No iframe found for Episode ${episode.episode_number}`);
                    return null;
                }
                
            } catch (error) {
                console.log(`    ❌ Error processing Episode ${episode.episode_number}: ${error.message}`);
                return null;
            }
        };
        
        console.log(`🎬 Processing all ${allEpisodes.length} episodes in parallel...`);
        
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
            
            console.log(`✅ Batch ${batchNumber} completed: ${validResults.length}/${batch.length} episodes successful`);
            console.log(`📊 Total episodes processed so far: ${streamingLinks.length}/${allEpisodes.length}`);
            
            const progressPercent = ((streamingLinks.length / allEpisodes.length) * 100).toFixed(1);
            const successRate = ((validResults.length / batch.length) * 100).toFixed(1);
            console.log(`📈 Progress: ${progressPercent}% complete | Batch success rate: ${successRate}%`);
            
            const delayTime = validResults.length > batch.length * 0.8 ? 500 : 1000;
            if (i + batchSize < allEpisodes.length) {
                await delay(delayTime);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📋 FINAL RESULTS SUMMARY - ALL EPISODES');
        console.log('='.repeat(80));
        console.log(`📺 Anime: ${animeInfo.title}`);
        console.log(`✅ Successfully extracted: ${streamingLinks.length}/${allEpisodes.length} episodes`);
        console.log(`❌ Failed episodes: ${allEpisodes.length - streamingLinks.length}`);
        console.log(`📈 Success rate: ${((streamingLinks.length / allEpisodes.length) * 100).toFixed(1)}%`);
        
        const strategyBreakdown = {};
        streamingLinks.forEach(link => {
            strategyBreakdown[link.strategy] = (strategyBreakdown[link.strategy] || 0) + 1;
        });
        console.log('📊 Success by strategy:', strategyBreakdown);
        
        const rangeBreakdown = {};
        streamingLinks.forEach(link => {
            const range = `Range ${link.range_id}`;
            rangeBreakdown[range] = (rangeBreakdown[range] || 0) + 1;
        });
        console.log('📊 Success by range:', rangeBreakdown);
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