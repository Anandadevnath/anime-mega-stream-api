import { chromium } from 'playwright';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeFilmList = async (baseUrl = 'https://w1.123animes.ru/az-all-anime/all/') => {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    try {
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });
        
        console.log('🌐 Loading film list page with Playwright...');
        await page.goto(baseUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 10000 
        });
        await delay(1000);
        
        console.log('🔍 Extracting anime links from film-list...');
        const animeLinks = await page.evaluate(() => {
            const filmList = document.querySelector('.film-list');
            if (!filmList) {
                return [];
            }
            
            const links = [];
            const items = filmList.querySelectorAll('.item');
            
            items.forEach((item, index) => {
                const inner = item.querySelector('.inner');
                if (!inner) return;
                
                const anchors = inner.querySelectorAll('a[href]');
                
                if (anchors.length >= 2) {
                    const firstLink = anchors[0];
                    const secondLink = anchors[1];
                    
                    const href = secondLink.href;
                    const title = secondLink.getAttribute('data-jititle') || 
                                 secondLink.textContent.trim() || 
                                 `Anime ${index + 1}`;
                    
                    const img = firstLink.querySelector('img');
                    let imageSrc = img ? img.src : null;
                    
                    if (imageSrc && imageSrc.startsWith('/')) {
                        imageSrc = 'https://w1.123animes.ru' + imageSrc;
                    }
                    
                    if (href && href.includes('/anime/')) {
                        links.push({
                            title: title,
                            url: href,
                            image: imageSrc,
                            index: index + 1
                        });
                    }
                }
            });
            
            return links.filter((link, index, self) => 
                index === self.findIndex(l => l.url === link.url)
            );
        });
        
        console.log(`✅ Found ${animeLinks.length} unique anime links`);
        
        if (animeLinks.length === 0) {
            return [];
        }
        
        const cleanResults = [];
        const animesToProcess = animeLinks.slice(0, 5);
        
        for (let i = 0; i < animesToProcess.length; i++) {
            const anime = animesToProcess[i];
            console.log(`\n[${i + 1}/${animesToProcess.length}] 🔍 Processing: ${anime.title}...`);
            
            try {
                await page.goto(anime.url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 8000
                });
                await delay(500);
                
                const allEpisodeLinks = await page.evaluate((currentAnimeUrl) => {
                    const episodeLinks = [];
                    
                    const allRanges = document.querySelectorAll('.episodes.range');
                    console.log(`Found ${allRanges.length} episode ranges`);
                    
                    allRanges.forEach((rangeContainer, rangeIndex) => {
                        const rangeId = rangeContainer.getAttribute('data-range-id');
                        const rangeStyle = rangeContainer.getAttribute('style');
                        const isVisible = !rangeStyle || !rangeStyle.includes('display:none');
                        
                        console.log(`Processing range ${rangeIndex + 1}: ID=${rangeId}, Visible=${isVisible}`);
                        
                        const episodeAnchors = rangeContainer.querySelectorAll('li a[href]');
                        
                        episodeAnchors.forEach(anchor => {
                            const episodeNumber = anchor.textContent.trim();
                            const episodeUrl = anchor.href;
                            const dataId = anchor.getAttribute('data-id');
                            
                            if (episodeUrl && episodeUrl.includes('episode')) {
                                episodeLinks.push({
                                    episode: episodeNumber,
                                    url: episodeUrl,
                                    data_id: dataId,
                                    range_id: rangeId,
                                    range_index: rangeIndex + 1,
                                    is_visible: isVisible
                                });
                            }
                        });
                    });
                    
                    if (episodeLinks.length === 0) {
                        console.log('No ranges found, trying fallback selectors...');
                        const fallbackLinks = document.querySelectorAll('.episodes a[href*="episode"], a[href*="episode"]');
                        
                        fallbackLinks.forEach((anchor, index) => {
                            const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                            const episodeUrl = anchor.href;
                            
                            episodeLinks.push({
                                episode: episodeNumber,
                                url: episodeUrl,
                                data_id: anchor.getAttribute('data-id'),
                                range_id: '0',
                                range_index: 1,
                                is_visible: true
                            });
                        });
                    }
                    
                    return episodeLinks.sort((a, b) => {
                        const numA = parseFloat(a.episode) || 0;
                        const numB = parseFloat(b.episode) || 0;
                        return numA - numB;
                    });
                }, anime.url);
                
                console.log(`  📺 Found ${allEpisodeLinks.length} episodes for ${anime.title}`);
                
                if (allEpisodeLinks.length === 0) {
                    console.log(`  ⚠️ No episodes found for ${anime.title}`);
                    continue;
                }
            

                const episodesToProcess = allEpisodeLinks; 
                
                console.log(`  🎬 Processing ALL ${episodesToProcess.length} episodes...`);
                
                for (let j = 0; j < episodesToProcess.length; j++) {
                    const episode = episodesToProcess[j];
                    console.log(`    📹 [${j + 1}/${episodesToProcess.length}] Episode: ${episode.episode}`);
                    
                    try {
                        await page.goto(episode.url, { 
                            waitUntil: 'domcontentloaded',
                            timeout: 6000 
                        });
                        await delay(300); 
                        
                        let streamingLink = await page.evaluate(() => {
                            const selectors = [
                                '#iframe_ext82377 iframe',
                                'iframe[src*="embed"]',
                                'iframe[src*="play"]',
                                'iframe[src*="stream"]',
                                'iframe[src*="video"]'
                            ];
                            
                            for (const selector of selectors) {
                                const iframe = document.querySelector(selector);
                                if (iframe && iframe.src && 
                                    iframe.src.length > 20 &&
                                    !iframe.src.includes('recaptcha') &&
                                    !iframe.src.includes('google.com') &&
                                    !iframe.src.includes('ads') &&
                                    iframe.src !== 'about:blank') {
                                    return iframe.src;
                                }
                            }
                            
                            const iframes = document.querySelectorAll('iframe');
                            for (let iframe of iframes) {
                                if (iframe.src && 
                                    iframe.src.length > 20 &&
                                    !iframe.src.includes('recaptcha') &&
                                    !iframe.src.includes('google.com') &&
                                    !iframe.src.includes('ads') &&
                                    iframe.src !== 'about:blank') {
                                    return iframe.src;
                                }
                            }
                            
                            return null;
                        });
                        
                        if (!streamingLink) {
                            await delay(1000);
                            streamingLink = await page.evaluate(() => {
                                const iframe = document.querySelector('#iframe_ext82377 iframe') ||
                                             document.querySelector('iframe[src*="embed"]') ||
                                             document.querySelector('iframe[src*="play"]') ||
                                             document.querySelector('iframe[src*="stream"]');
                                return iframe ? iframe.src : null;
                            });
                        }

                        if (streamingLink) {
                            cleanResults.push({
                                title: anime.title,
                                episode: episode.episode,
                                streaming_link: streamingLink
                            });
                            console.log(`      ✅ Found streaming link`);
                        } else {
                            console.log(`      ❌ No streaming link found`);
                        }
                        
                        if (j < episodesToProcess.length - 1) {
                            await delay(200);
                        }
                        
                    } catch (error) {
                        console.log(`      ❌ Error processing episode: ${error.message}`);
                    }
                }
                
                const animeResults = cleanResults.filter(r => r.title === anime.title);
                console.log(`  ✅ Completed ${anime.title}: Found ${allEpisodeLinks.length} episodes, extracted ${animeResults.length} streaming links`);
                
                if (i < animesToProcess.length - 1) {
                    await delay(500);
                }
                
            } catch (error) {
                console.log(`❌ Error processing ${anime.title}: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📋 FINAL RESULTS SUMMARY - PLAYWRIGHT');
        console.log('='.repeat(80));
        console.log(`✅ Total streaming links found: ${cleanResults.length}`);
        
        const animeCount = new Set(cleanResults.map(r => r.title)).size;
        console.log(`📺 Anime processed: ${animeCount}`);
        
        const groupedResults = {};
        cleanResults.forEach(result => {
            if (!groupedResults[result.title]) {
                groupedResults[result.title] = [];
            }
            groupedResults[result.title].push(result);
        });
        
        Object.entries(groupedResults).forEach(([title, episodes]) => {
            console.log(`📺 ${title}: ${episodes.length} episodes`);
            episodes.forEach((ep, index) => {
                console.log(`   ${index + 1}. Episode ${ep.episode}`);
            });
        });
        
        return cleanResults;
        
    } catch (error) {
        console.error('❌ Playwright Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};