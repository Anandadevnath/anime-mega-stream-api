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
