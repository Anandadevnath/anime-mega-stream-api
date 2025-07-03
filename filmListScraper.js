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
        // Allow images temporarily to get poster data
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();
            
            // Block only heavy resources but allow small images for posters
            if (['stylesheet', 'font', 'media'].includes(resourceType) ||
                (resourceType === 'image' && url.includes('.gif'))) {
                route.abort();
            } else {
                route.continue();
            }
        });
        
        console.log('🌐 Loading film list page...');
        await page.goto(baseUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 10000 
        });
        await delay(3000); // Increased delay to let images load
        
        console.log('🔍 Extracting anime list...');
        const animeList = await page.evaluate(() => {
            const filmList = document.querySelector('.film-list');
            if (!filmList) return [];
            
            const items = filmList.querySelectorAll('.item');
            const animeData = [];
            
            items.forEach((item, index) => {
                const inner = item.querySelector('.inner');
                if (!inner) return;
                
                const anchors = inner.querySelectorAll('a[href]');
                
                if (anchors.length >= 2) {
                    const firstLink = anchors[0]; // Image link
                    const secondLink = anchors[1]; // Title link
                    
                    const title = secondLink.getAttribute('data-jititle') || 
                                 secondLink.textContent.trim() || 
                                 `Anime ${index + 1}`;
                    
                    const redirectLink = secondLink.href;
                    
                    // Enhanced image extraction from the HTML structure
                    let imageSrc = null;
                    
                    // First, try to find the img element inside the first anchor
                    const imgElement = firstLink.querySelector('img');
                    
                    if (imgElement) {
                        // Try different attributes in order of preference
                        imageSrc = imgElement.getAttribute('src') || 
                                  imgElement.getAttribute('data-src') || 
                                  imgElement.getAttribute('data-original') ||
                                  imgElement.src;
                        
                        console.log(`Found image for ${title}: ${imageSrc}`);
                    }
                    
                    // If no img element, try background-image on the anchor or its children
                    if (!imageSrc) {
                        const elementsWithBg = [firstLink, ...firstLink.querySelectorAll('*')];
                        for (const element of elementsWithBg) {
                            const style = element.getAttribute('style') || '';
                            const computedStyle = window.getComputedStyle(element);
                            const bgImage = computedStyle.backgroundImage || style;
                            
                            if (bgImage && bgImage.includes('url(')) {
                                const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                                if (match) {
                                    imageSrc = match[1];
                                    console.log(`Found background image for ${title}: ${imageSrc}`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Fix relative URLs
                    if (imageSrc && imageSrc.startsWith('/')) {
                        imageSrc = 'https://w1.123animes.ru' + imageSrc;
                    }
                    
                    // Only filter out obvious placeholders, keep real poster paths
                    if (imageSrc && (
                        imageSrc.includes('no_poster.jpg') || 
                        imageSrc.includes('placeholder.') ||
                        imageSrc.includes('default.jpg') ||
                        imageSrc.includes('no-image.') ||
                        imageSrc.includes('loading.') ||
                        imageSrc === 'about:blank'
                    )) {
                        console.log(`Filtered placeholder image: ${imageSrc}`);
                        imageSrc = null;
                    }
                    
                    // Get episode count and audio type from status
                    const statusDiv = firstLink.querySelector('.status');
                    let episodes = null;
                    let audioType = null;
                    
                    if (statusDiv) {
                        const epDiv = statusDiv.querySelector('.ep');
                        const subSpan = statusDiv.querySelector('.sub');
                        
                        episodes = epDiv?.textContent.trim() || null;
                        
                        if (subSpan) {
                            audioType = subSpan.textContent.trim();
                        } else {
                            audioType = title.toLowerCase().includes('dub') ? 'DUB' : 'SUB';
                        }
                    }
                    
                    if (redirectLink && redirectLink.includes('/anime/')) {
                        animeData.push({
                            title: title,
                            anime_redirect_link: redirectLink,
                            episodes: episodes,
                            image: imageSrc, 
                            audio_type: audioType,
                            index: index + 1
                        });
                    }
                }
            });
            
            return animeData.filter((anime, index, self) => 
                index === self.findIndex(a => a.anime_redirect_link === anime.anime_redirect_link)
            );
        });
        
        console.log(`✅ Found ${animeList.length} anime`);
        console.log(`🖼️ Found ${animeList.filter(a => a.image).length} anime with poster images`);
        
        return animeList;
        
    } catch (error) {
        console.error('❌ Error scraping film list:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};

export const scrapeAnimeDetails = async (animeUrl) => {
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
        // Allow scripts for iframe loading but block heavy resources
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();
            
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType) ||
                url.includes('.jpg') ||
                url.includes('.png') ||
                url.includes('.gif') ||
                url.includes('.css')) {
                route.abort();
            } else {
                route.continue();
            }
        });
        
        console.log(`🔍 Loading anime details from: ${animeUrl}`);
        await page.goto(animeUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });
        await delay(1000);
        
        // Extract anime title from the page
        const animeTitle = await page.evaluate(() => {
            // Try multiple selectors for anime title
            const titleSelectors = [
                '.entry-title',
                '.anime-title',
                'h1.title',
                '.infoz h1',
                'h1',
                '.post-title'
            ];
            
            for (const selector of titleSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    return element.textContent.trim();
                }
            }
            
            // Fallback: extract from URL
            const urlParts = window.location.pathname.split('/');
            const animeName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
            return animeName ? animeName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown Anime';
        });
        
        console.log(`📺 Anime Title: ${animeTitle}`);
        
        // Extract episode ranges
        const episodeRanges = await page.evaluate(() => {
            const ranges = [];
            const allRanges = document.querySelectorAll('.episodes.range');
            
            console.log(`Found ${allRanges.length} episode ranges`);
            
            allRanges.forEach((rangeContainer, rangeIndex) => {
                const rangeId = rangeContainer.getAttribute('data-range-id');
                const rangeStyle = rangeContainer.getAttribute('style');
                const isVisible = !rangeStyle || !rangeStyle.includes('display:none');
                
                const episodes = [];
                const episodeAnchors = rangeContainer.querySelectorAll('li a[href]');
                
                episodeAnchors.forEach(anchor => {
                    const episodeNumber = anchor.textContent.trim();
                    const episodeUrl = anchor.href;
                    const dataId = anchor.getAttribute('data-id');
                    
                    if (episodeUrl && episodeUrl.includes('episode')) {
                        episodes.push({
                            episode_number: episodeNumber,
                            episode_url: episodeUrl,
                            data_id: dataId
                        });
                    }
                });
                
                if (episodes.length > 0) {
                    ranges.push({
                        range_id: rangeId,
                        range_index: rangeIndex + 1,
                        is_visible: isVisible,
                        episodes: episodes.sort((a, b) => {
                            const numA = parseFloat(a.episode_number) || 0;
                            const numB = parseFloat(b.episode_number) || 0;
                            return numA - numB;
                        })
                    });
                }
            });
            
            // Fallback if no ranges found
            if (ranges.length === 0) {
                console.log('No ranges found, trying fallback...');
                const fallbackLinks = document.querySelectorAll('.episodes a[href*="episode"], a[href*="episode"]');
                
                if (fallbackLinks.length > 0) {
                    const episodes = [];
                    fallbackLinks.forEach((anchor, index) => {
                        const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                        const episodeUrl = anchor.href;
                        
                        if (episodeUrl && episodeUrl.includes('episode')) {
                            episodes.push({
                                episode_number: episodeNumber,
                                episode_url: episodeUrl,
                                data_id: anchor.getAttribute('data-id')
                            });
                        }
                    });
                    
                    if (episodes.length > 0) {
                        ranges.push({
                            range_id: '0',
                            range_index: 1,
                            is_visible: true,
                            episodes: episodes.sort((a, b) => {
                                const numA = parseFloat(a.episode_number) || 0;
                                const numB = parseFloat(b.episode_number) || 0;
                                return numA - numB;
                            })
                        });
                    }
                }
            }
            
            return ranges;
        });
        
        console.log(`📺 Found ${episodeRanges.length} episode ranges`);
        
        if (episodeRanges.length === 0) {
            return [];
        }
        
        // Extract streaming links for ALL episodes
        const streamingLinks = [];
        
        console.log(`🎬 Extracting streaming links for ALL episodes...`);
        
        for (const range of episodeRanges) {
            console.log(`  📂 Processing range ${range.range_index} (${range.episodes.length} episodes)`);
            
            // Process ALL episodes - no limit
            for (const episode of range.episodes) {
                try {
                    console.log(`    🔗 Episode ${episode.episode_number}...`);
                    
                    await page.goto(episode.episode_url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 8000
                    });
                    await delay(2000); // Wait for iframe to load
                    
                    // Enhanced iframe detection
                    let streamingLink = null;
                    
                    // First attempt
                    streamingLink = await page.evaluate(() => {
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
                                iframe.src !== 'about:blank') {
                                return iframe.src;
                            }
                        }
                        
                        // Fallback
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
                    
                    // Second attempt if needed
                    if (!streamingLink) {
                        await delay(3000);
                        streamingLink = await page.evaluate(() => {
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
                    
                    if (streamingLink) {
                        streamingLinks.push({
                            title: animeTitle,
                            episode_number: episode.episode_number,
                            episode_url: episode.episode_url,
                            streaming_link: streamingLink
                        });
                        console.log(`      ✅ Found streaming link`);
                    } else {
                        console.log(`      ❌ No streaming link found`);
                    }
                    
                    await delay(300); 
                    
                } catch (error) {
                    console.log(`      ❌ Error: ${error.message}`);
                }
            }
        }
        
        console.log(`✅ Extracted ${streamingLinks.length} streaming links total`);
        
        return streamingLinks;
        
    } catch (error) {
        console.error('❌ Error scraping anime details:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};