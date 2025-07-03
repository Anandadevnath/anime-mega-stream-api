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
            const url = route.request().url();
            
            if (['stylesheet', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });
        
        console.log('🌐 Loading film list page...');
        await page.goto(baseUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 20000 
        });
        
        try {
            await page.waitForSelector('.film-list', { timeout: 10000 });
            console.log('✅ Film list container found');
        } catch (e) {
            console.log('⚠️ Film list container not found, trying alternative selectors...');
            const alternatives = ['.container', '.main-content', '.content', '#content'];
            for (const selector of alternatives) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    console.log(`✅ Found alternative container: ${selector}`);
                    break;
                } catch (err) {
                    continue;
                }
            }
        }
        
        await delay(3000); 
        
        console.log('📜 Scrolling to trigger lazy loading...');
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(2000);
        
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        await delay(1000);
        
        console.log('🖼️ Waiting for images to load...');
        await page.evaluate(() => {
            return new Promise((resolve) => {
                const images = document.querySelectorAll('img');
                let loadedCount = 0;
                const totalImages = images.length;
                
                console.log(`Found ${totalImages} images to load`);
                
                if (totalImages === 0) {
                    resolve();
                    return;
                }
                
                const checkComplete = () => {
                    loadedCount++;
                    console.log(`Loaded ${loadedCount}/${totalImages} images`);
                    if (loadedCount >= totalImages) {
                        resolve();
                    }
                };
                
                images.forEach(img => {
                    if (img.complete && img.naturalWidth > 0) {
                        checkComplete();
                    } else {
                        img.addEventListener('load', checkComplete);
                        img.addEventListener('error', checkComplete);
                    }
                });
                
                setTimeout(() => {
                    console.log(`Image loading timeout reached, continuing with ${loadedCount}/${totalImages} loaded`);
                    resolve();
                }, 5000);
            });
        });
        
        console.log('🔍 Extracting anime list...');
        const animeList = await page.evaluate(() => {
            const filmList = document.querySelector('.film-list');
            if (!filmList) {
                console.log('❌ .film-list not found, trying alternatives...');
                const alternatives = document.querySelectorAll('.container .item, .main-content .item, .content .item');
                if (alternatives.length === 0) {
                    console.log('❌ No anime items found with alternative selectors');
                    return [];
                }
                console.log(`✅ Found ${alternatives.length} items with alternative selectors`);
            }
            
            const items = filmList ? filmList.querySelectorAll('.item') : document.querySelectorAll('.item');
            const animeData = [];
            
            console.log(`Found ${items.length} anime items`);
            
            items.forEach((item, index) => {
                const inner = item.querySelector('.inner');
                if (!inner) return;
                
                const anchors = inner.querySelectorAll('a[href]');
                
                if (anchors.length >= 2) {
                    const firstLink = anchors[0]; 
                    const secondLink = anchors[1];
                    
                    const title = secondLink.getAttribute('data-jititle') || 
                                 secondLink.textContent.trim() || 
                                 `Anime ${index + 1}`;
                    
                    const redirectLink = secondLink.href;
                    
                    let imageSrc = null;
                    
                    console.log(`Processing item ${index + 1}: "${title}"`);
                    
                    const imgElement = firstLink.querySelector('img');
                    
                    if (imgElement) {
                        console.log(`Found img element for "${title}"`);
                        console.log(`Img src: ${imgElement.getAttribute('src')}`);
                        console.log(`Img data-src: ${imgElement.getAttribute('data-src')}`);
                        
                        imageSrc = imgElement.getAttribute('data-src') || 
                                  imgElement.getAttribute('data-original') ||
                                  imgElement.getAttribute('data-lazy') ||
                                  imgElement.getAttribute('src') ||
                                  imgElement.src;
                        
                        console.log(`Extracted image for "${title}": ${imageSrc}`);
                    } else {
                        console.log(`No img element found in first link for "${title}"`);
                    }
                    
                    if (!imageSrc) {
                        const allImgs = item.querySelectorAll('img');
                        console.log(`Found ${allImgs.length} total img elements in item`);
                        
                        for (const img of allImgs) {
                            const src = img.getAttribute('src') || img.getAttribute('data-src');
                            if (src && (src.includes('/poster/') || src.includes('.jpg') || src.includes('.png'))) {
                                imageSrc = src;
                                console.log(`Found alternative image for "${title}": ${imageSrc}`);
                                break;
                            }
                        }
                    }
                    
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
                                    console.log(`Found background image for "${title}": ${imageSrc}`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (!imageSrc) {
                        const dataAttrs = ['data-src', 'data-image', 'data-poster', 'data-thumb'];
                        for (const attr of dataAttrs) {
                            const value = firstLink.getAttribute(attr);
                            if (value && (value.includes('.jpg') || value.includes('.png') || value.includes('.jpeg'))) {
                                imageSrc = value;
                                console.log(`Found data attribute image for "${title}": ${imageSrc}`);
                                break;
                            }
                        }
                    }
                    
                    if (imageSrc && imageSrc.startsWith('/')) {
                        imageSrc = 'https://w1.123animes.ru' + imageSrc;
                    }
                    
                    if (imageSrc && (
                        imageSrc.includes('no_poster.jpg') || 
                        imageSrc.includes('placeholder.') ||
                        imageSrc.includes('default.jpg') ||
                        imageSrc.includes('no-image.') ||
                        imageSrc.includes('loading.') ||
                        imageSrc.includes('lazy.') ||
                        imageSrc === 'about:blank' ||
                        imageSrc.length < 10
                    )) {
                        console.log(`Filtered placeholder image for "${title}": ${imageSrc}`);
                        imageSrc = null;
                    }
                    
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
            timeout: 15000 
        });
        await delay(1000);
        
        const animeInfo = await page.evaluate(() => {
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
        
        const streamingLinks = [];
        
        console.log(`🎬 Extracting streaming links for ALL episodes...`);
        
        for (const range of episodeRanges) {
            console.log(`  📂 Processing range ${range.range_index} (${range.episodes.length} episodes)`);
            
            for (const episode of range.episodes) {
                try {
                    console.log(`    🔗 Episode ${episode.episode_number}...`);
                    
                    await page.goto(episode.episode_url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 8000
                    });
                    await delay(2000);
                    
                    let streamingLink = null;
                    
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
                            title: animeInfo.title,
                            episode_number: episode.episode_number,
                            episode_url: episode.episode_url,
                            streaming_link: streamingLink,
                            image: animeInfo.posterImage 
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