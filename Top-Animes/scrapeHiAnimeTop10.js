import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeHiAnimeTop10 = async () => {
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

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('🌐 Loading HiAnime home page...');
        await page.goto('https://hianime.to/home', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await delay(5000);

        console.log('🔍 Scraping HiAnime titles...');
        
        // Get titles from HiAnime
        const hiAnimeTitles = await page.evaluate(() => {
            const results = [];
            const processedTitles = new Set();
            
            // Get trending anime titles
            const trendingSection = document.querySelector('.anif-block-ul.anif-block-chart.tab-pane.active');
            if (trendingSection) {
                const trendingItems = trendingSection.querySelectorAll('.item-top');
                
                trendingItems.forEach((item, index) => {
                    if (results.length >= 10) return;
                    
                    try {
                        const titleElement = item.querySelector('.film-name a');
                        const title = titleElement ? titleElement.textContent.trim() : null;
                        
                        if (title && !processedTitles.has(title)) {
                            processedTitles.add(title);
                            results.push(title);
                        }
                    } catch (error) {
                        console.log(`Error processing trending item ${index + 1}:`, error.message);
                    }
                });
            }
            
            // Get more titles if needed
            if (results.length < 10) {
                const listItems = document.querySelectorAll('.anif-block-ul.anif-block-chart.tab-pane.active li:not(.item-top)');
                
                listItems.forEach((item, index) => {
                    if (results.length >= 10) return;
                    
                    try {
                        const titleElement = item.querySelector('.film-name a, .dynamic-name, a[title], a');
                        const title = titleElement ? (titleElement.textContent.trim() || titleElement.getAttribute('title')) : null;
                        
                        if (title && title.length > 3 && !processedTitles.has(title)) {
                            processedTitles.add(title);
                            results.push(title);
                        }
                    } catch (error) {
                        console.log(`Error processing list item ${index + 1}:`, error.message);
                    }
                });
            }
            
            return results;
        });

        console.log(`✅ Got ${hiAnimeTitles.length} titles from HiAnime:`, hiAnimeTitles);

        // Now get detailed metadata from the working 123animes.ru
        console.log('🔍 Getting detailed metadata from 123animes.ru...');
        const detailedAnimeList = await getDetailedMetadataFrom123Anime(hiAnimeTitles, browser);

        return detailedAnimeList;

    } catch (error) {
        console.error('❌ Error scraping HiAnime:', error.message);
        
        // Return fallback data if scraping fails
        return [
            {
                index: 1,
                title: "Scraping Error",
                anime_redirect_link: "https://hianime.to",
                episodes: "N/A",
                image: null,
                audio_type: "SUB",
                type: "Error",
                genres: "N/A",
                country: "N/A",
                status: "N/A",
                released: "N/A",
                description: `Error occurred while scraping: ${error.message}`
            }
        ];
    } finally {
        await browser.close();
    }
};

const getDetailedMetadataFrom123Anime = async (titles, browser) => {
    const page = await browser.newPage();
    
    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log('🌐 Loading 123animes.ru all anime page...');
        await page.goto('https://w1.123animes.ru/az-all-anime/all/', {
            waitUntil: 'domcontentloaded',
            timeout: 20000
        });

        // Wait for page to load
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
                    resolve();
                }, 5000);
            });
        });

        console.log('🔍 Extracting anime metadata from 123animes.ru...');
        const animeMetadata = await page.evaluate(() => {
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

                    // Enhanced image extraction with comprehensive fallback
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

                    // Check for background images
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

                    // Check data attributes
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

                    // Filter out placeholder images
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

                    // Extract episodes and audio type
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
                            audio_type: audioType
                        });
                        
                        console.log(`Added anime: "${title}" with image: ${imageSrc ? 'YES' : 'NO'}`);
                    }
                }
            });

            console.log(`Extracted ${animeData.length} anime from 123animes.ru`);
            console.log('Sample titles:', animeData.slice(0, 5).map(a => a.title));
            console.log('Sample images:', animeData.slice(0, 5).map(a => a.image));
            
            // Remove duplicates
            return animeData.filter((anime, index, self) =>
                index === self.findIndex(a => a.anime_redirect_link === anime.anime_redirect_link)
            );
        });

        console.log(`✅ Found ${animeMetadata.length} anime from 123animes.ru`);
        console.log('📋 Sample 123animes.ru titles:', animeMetadata.slice(0, 10).map(a => a.title));
        console.log('🖼️ Sample images:', animeMetadata.slice(0, 10).map(a => a.image));

        // If no anime found, return fallback data immediately
        if (animeMetadata.length === 0) {
            console.log('❌ No anime found from 123animes.ru, returning fallback data');
            return titles.map((title, index) => ({
                index: index + 1,
                title: title,
                anime_redirect_link: `https://w1.123animes.ru/anime/${title.toLowerCase().replace(/\s+/g, '-')}`,
                episodes: 'N/A',
                image: null,
                audio_type: 'SUB',
                type: 'TV Series',
                genres: 'Action, Adventure',
                country: 'Japan',
                status: 'Ongoing',
                released: '2024',
                description: `${title} - Popular anime series from HiAnime trending section.`
            }));
        }

        // Match HiAnime titles with 123anime metadata
        const matchedAnime = [];
        const limit = pLimit(3); // Reduced concurrency

        for (let i = 0; i < Math.min(titles.length, 10); i++) {
            const hiAnimeTitle = titles[i];
            
            console.log(`\n🔍 [${i + 1}/${titles.length}] Matching HiAnime title: "${hiAnimeTitle}"`);
            
            // Find best match from 123anime
            const bestMatch = findBestMatch(hiAnimeTitle, animeMetadata);
            
            if (bestMatch) {
                console.log(`🔗 Matched "${hiAnimeTitle}" with "${bestMatch.title}"`);
                console.log(`📍 Redirect link: ${bestMatch.anime_redirect_link}`);
                console.log(`🖼️ Image: ${bestMatch.image || 'None'}`);
                
                // Get detailed metadata from the anime page
                const detailedMetadata = await limit(() => 
                    extractDetailedMetadata(bestMatch, browser)
                );

                matchedAnime.push({
                    index: i + 1,
                    title: hiAnimeTitle, // Use HiAnime title
                    anime_redirect_link: bestMatch.anime_redirect_link,
                    episodes: bestMatch.episodes || 'N/A',
                    image: bestMatch.image,
                    audio_type: bestMatch.audio_type || 'SUB',
                    type: detailedMetadata.type || 'TV Series',
                    genres: detailedMetadata.genres || 'Action, Adventure',
                    country: detailedMetadata.country || 'Japan',
                    status: detailedMetadata.status || 'Ongoing',
                    released: detailedMetadata.released || '2024',
                    description: detailedMetadata.description || `${hiAnimeTitle} - Popular anime series from HiAnime trending section.`
                });
            } else {
                console.log(`❌ No match found for "${hiAnimeTitle}"`);
                
                // Use the first available anime from 123anime as fallback
                const fallbackAnime = animeMetadata[i % animeMetadata.length];
                
                if (fallbackAnime) {
                    console.log(`🔄 Using fallback anime: "${fallbackAnime.title}"`);
                    console.log(`📍 Fallback redirect link: ${fallbackAnime.anime_redirect_link}`);
                    console.log(`🖼️ Fallback image: ${fallbackAnime.image || 'None'}`);
                    
                    const detailedMetadata = await limit(() => 
                        extractDetailedMetadata(fallbackAnime, browser)
                    );

                    matchedAnime.push({
                        index: i + 1,
                        title: hiAnimeTitle, // Keep HiAnime title
                        anime_redirect_link: fallbackAnime.anime_redirect_link,
                        episodes: fallbackAnime.episodes || 'N/A',
                        image: fallbackAnime.image,
                        audio_type: fallbackAnime.audio_type || 'SUB',
                        type: detailedMetadata.type || 'TV Series',
                        genres: detailedMetadata.genres || 'Action, Adventure',
                        country: detailedMetadata.country || 'Japan',
                        status: detailedMetadata.status || 'Ongoing',
                        released: detailedMetadata.released || '2024',
                        description: detailedMetadata.description || `${hiAnimeTitle} - Popular anime series from HiAnime trending section.`
                    });
                } else {
                    // Last resort fallback with a generated link
                    matchedAnime.push({
                        index: i + 1,
                        title: hiAnimeTitle,
                        anime_redirect_link: `https://w1.123animes.ru/anime/${hiAnimeTitle.toLowerCase().replace(/\s+/g, '-')}`,
                        episodes: 'N/A',
                        image: null,
                        audio_type: 'SUB',
                        type: 'TV Series',
                        genres: 'Action, Adventure',
                        country: 'Japan',
                        status: 'Ongoing',
                        released: '2024',
                        description: `${hiAnimeTitle} - Popular anime series from HiAnime trending section.`
                    });
                }
            }
        }

        console.log(`\n✅ Final Results: ${matchedAnime.length} anime processed`);
        console.log('📊 Summary:');
        matchedAnime.forEach(anime => {
            console.log(`  ${anime.index}. "${anime.title}" - Link: ${anime.anime_redirect_link ? 'YES' : 'NO'}, Image: ${anime.image ? 'YES' : 'NO'}`);
        });

        return matchedAnime;

    } catch (error) {
        console.error('❌ Error getting metadata from 123animes.ru:', error.message);
        
        // Return basic data with HiAnime titles and generated links
        return titles.map((title, index) => ({
            index: index + 1,
            title: title,
            anime_redirect_link: `https://w1.123animes.ru/anime/${title.toLowerCase().replace(/\s+/g, '-')}`,
            episodes: 'N/A',
            image: null,
            audio_type: 'SUB',
            type: 'TV Series',
            genres: 'Action, Adventure',
            country: 'Japan',
            status: 'Ongoing',
            released: '2024',
            description: `${title} - Popular anime series from HiAnime trending section.`
        }));
    } finally {
        await page.close();
    }
};

const findBestMatch = (hiAnimeTitle, animeMetadata) => {
    // Clean titles for comparison
    const cleanTitle = (title) => {
        return title.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const cleanHiAnimeTitle = cleanTitle(hiAnimeTitle);
    console.log(`🔍 Looking for matches for cleaned title: "${cleanHiAnimeTitle}"`);
    
    // Find exact match first
    let bestMatch = animeMetadata.find(anime => {
        const cleanAnimeTitle = cleanTitle(anime.title);
        const isMatch = cleanAnimeTitle === cleanHiAnimeTitle;
        if (isMatch) {
            console.log(`✅ Found exact match: "${anime.title}"`);
        }
        return isMatch;
    });

    if (bestMatch) return bestMatch;

    // Find partial match
    bestMatch = animeMetadata.find(anime => {
        const cleanAnimeTitle = cleanTitle(anime.title);
        const isMatch = cleanAnimeTitle.includes(cleanHiAnimeTitle) || 
                       cleanHiAnimeTitle.includes(cleanAnimeTitle);
        if (isMatch) {
            console.log(`✅ Found partial match: "${anime.title}"`);
        }
        return isMatch;
    });

    if (bestMatch) return bestMatch;

    // Find by first word match
    const firstWord = cleanHiAnimeTitle.split(' ')[0];
    if (firstWord.length > 3) {
        bestMatch = animeMetadata.find(anime => {
            const cleanAnimeTitle = cleanTitle(anime.title);
            const isMatch = cleanAnimeTitle.startsWith(firstWord);
            if (isMatch) {
                console.log(`✅ Found first word match: "${anime.title}" (${firstWord})`);
            }
            return isMatch;
        });
    }

    if (bestMatch) return bestMatch;

    // Try fuzzy matching with keywords
    const keywords = cleanHiAnimeTitle.split(' ').filter(word => word.length > 2);
    if (keywords.length > 0) {
        bestMatch = animeMetadata.find(anime => {
            const cleanAnimeTitle = cleanTitle(anime.title);
            const hasKeywords = keywords.some(keyword => cleanAnimeTitle.includes(keyword));
            if (hasKeywords) {
                console.log(`✅ Found keyword match: "${anime.title}" (${keywords.join(', ')})`);
            }
            return hasKeywords;
        });
    }

    if (!bestMatch) {
        console.log(`❌ No match found for "${hiAnimeTitle}"`);
        console.log('Available titles sample:', animeMetadata.slice(0, 10).map(a => a.title));
    }

    return bestMatch;
};

const extractDetailedMetadata = async (anime, browser) => {
    const page = await browser.newPage();

    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();

            if (['image', 'stylesheet', 'font', 'media', 'websocket', 'manifest'].includes(resourceType) ||
                url.includes('google-analytics') ||
                url.includes('googletagmanager') ||
                url.includes('facebook.com') ||
                url.includes('twitter.com') ||
                url.includes('ads') ||
                url.includes('analytics') ||
                url.includes('tracking')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(anime.anime_redirect_link, {
            waitUntil: 'domcontentloaded',
            timeout: 8000
        });

        await delay(800);

        const metadata = await page.evaluate(() => {
            const extractMetadata = () => {
                const metadata = {
                    type: null,
                    genres: null,
                    country: null,
                    status: null,
                    released: null,
                    description: null
                };

                console.log('📝 Searching for anime description...');

                const isValidDescription = (text) => {
                    if (!text || text.length < 50) return false;
                    if (text.length > 1500) return false;

                    const lowerText = text.toLowerCase();

                    const excludedPhrases = [
                        'you can also use the keyboard shortcuts',
                        'keyboard shortcuts to control',
                        'control the player',
                        'one way or another, keep comments',
                        'comments related to the anime',
                        'about 123animes in general',
                        'streaming', 'watch online', 'click here',
                        'download', 'loading', 'error', 'advertisement',
                        'disable adblock', 'ad block', 'popup', 'redirect',
                        'mirror', 'server', 'quality', 'resolution',
                        'less', 'more', 'show more', 'show less',
                        'morelink', 'cursor:pointer'
                    ];

                    for (const phrase of excludedPhrases) {
                        if (lowerText.includes(phrase)) {
                            console.log(`❌ Excluded description containing: "${phrase}"`);
                            return false;
                        }
                    }

                    const storyKeywords = [
                        'story', 'character', 'world', 'adventure', 'journey',
                        'protagonist', 'hero', 'villain', 'power', 'magic',
                        'school', 'student', 'friend', 'battle', 'fight',
                        'love', 'romance', 'family', 'life', 'death',
                        'mystery', 'secret', 'truth', 'past', 'future',
                        'anime', 'manga', 'series', 'follows', 'plot',
                        'young', 'boy', 'girl', 'man', 'woman', 'dreams',
                        'goals', 'challenges', 'overcome', 'discovers',
                        'name', 'known', 'being', 'becomes', 'encounter',
                        'handsome', 'beautiful', 'popular', 'student',
                        'despite', 'would', 'suggest', 'resemblance',
                        'bears', 'flower', 'eyes', 'small', 'limbs',
                        'slender', 'cute', 'fairy-tale', 'daydreaming',
                        'morning', 'tends', 'contact', 'classmate'
                    ];

                    const hasStoryKeywords = storyKeywords.some(keyword =>
                        lowerText.includes(keyword)
                    );

                    if (!hasStoryKeywords) {
                        console.log(`❌ Description doesn't contain story-related keywords`);
                        return false;
                    }

                    return true;
                };

                // Try to find description with multiple strategies
                console.log('🔍 Looking for div.long...');
                const longDiv = document.querySelector('div.long');
                if (longDiv) {
                    console.log('✅ Found div.long');
                    const text = longDiv.textContent.trim();
                    console.log(`Testing long div text: "${text.substring(0, 100)}..."`);

                    if (isValidDescription(text)) {
                        metadata.description = text;
                        console.log(`✅ Found valid description in div.long: ${text.substring(0, 100)}...`);
                    }
                }

                if (!metadata.description) {
                    console.log('🔍 Looking for div.short...');
                    const shortDiv = document.querySelector('div.short');
                    if (shortDiv) {
                        console.log('✅ Found div.short');
                        const text = shortDiv.textContent.trim();
                        console.log(`Testing short div text: "${text.substring(0, 100)}..."`);

                        if (isValidDescription(text)) {
                            metadata.description = text;
                            console.log(`✅ Found valid description in div.short: ${text.substring(0, 100)}...`);
                        }
                    }
                }

                if (!metadata.description) {
                    console.log('🔍 Looking for description containers...');
                    const descriptionSelectors = [
                        '.description',
                        '.synopsis',
                        '.plot',
                        '.summary',
                        '.story',
                        '.anime-description',
                        '.content-description',
                        'div[class*="desc"]',
                        'div[class*="syn"]',
                        'p.description',
                        'p.synopsis',
                        '.dses',
                        'p.dses'
                    ];

                    for (const selector of descriptionSelectors) {
                        const elements = document.querySelectorAll(selector);
                        console.log(`Found ${elements.length} elements with selector: ${selector}`);

                        for (const element of elements) {
                            const text = element.textContent.trim();
                            console.log(`Testing description element text: "${text.substring(0, 100)}..."`);

                            if (isValidDescription(text)) {
                                metadata.description = text;
                                console.log(`✅ Found valid description with selector "${selector}": ${text.substring(0, 100)}...`);
                                break;
                            }
                        }

                        if (metadata.description) break;
                    }
                }

                if (!metadata.description) {
                    console.log('🔍 Looking in tooltipster elements...');
                    const tooltipsterSelectors = [
                        '[id*="tooltipster"] .tooltipster-content p.dses',
                        '[id*="tooltipster"] .tooltipster-content .dses',
                        '[id*="tooltipster"] p.dses',
                        '[id*="tooltipster"] .dses',
                        '.tooltipster-content p.dses',
                        '.tooltipster-content .dses',
                        '[class*="tooltipster"] p.dses',
                        '[class*="tooltipster"] .dses',
                        '[class*="tooltip"] p.dses',
                        '[class*="tooltip"] .dses'
                    ];

                    for (const selector of tooltipsterSelectors) {
                        const elements = document.querySelectorAll(selector);
                        console.log(`Found ${elements.length} elements with tooltipster selector: ${selector}`);

                        for (const element of elements) {
                            const text = element.textContent.trim();
                            console.log(`Testing tooltipster text: "${text.substring(0, 100)}..."`);

                            if (isValidDescription(text)) {
                                metadata.description = text;
                                console.log(`✅ Found valid description in tooltipster: ${text.substring(0, 100)}...`);
                                break;
                            }
                        }

                        if (metadata.description) break;
                    }
                }

                if (!metadata.description) {
                    console.log('🔍 Looking in content areas...');
                    const contentAreas = document.querySelectorAll('.content, .main-content, .post-content, .entry-content, .article-content, .info, .details');

                    for (const area of contentAreas) {
                        const paragraphs = area.querySelectorAll('p, div');

                        for (const element of paragraphs) {
                            const text = element.textContent.trim();

                            if (element.closest('[class*="control"]') ||
                                element.closest('[class*="player"]') ||
                                element.closest('[class*="video"]') ||
                                element.closest('[class*="nav"]') ||
                                element.closest('[class*="menu"]') ||
                                element.closest('[class*="button"]') ||
                                element.closest('[class*="morelink"]')) {
                                continue;
                            }

                            if (isValidDescription(text)) {
                                metadata.description = text;
                                console.log(`✅ Found valid description in content area: ${text.substring(0, 100)}...`);
                                break;
                            }
                        }

                        if (metadata.description) break;
                    }
                }

                if (!metadata.description) {
                    console.log('🔍 Looking for any div with substantial text...');
                    const allDivs = document.querySelectorAll('div');

                    for (const div of allDivs) {
                        if (div.children.length > 2) continue;

                        const text = div.textContent.trim();

                        if (text.length < 100) continue;

                        if (div.closest('[class*="control"]') ||
                            div.closest('[class*="player"]') ||
                            div.closest('[class*="video"]') ||
                            div.closest('[class*="nav"]') ||
                            div.closest('[class*="menu"]') ||
                            div.closest('[class*="button"]') ||
                            div.closest('[class*="morelink"]')) {
                            continue;
                        }

                        if (isValidDescription(text)) {
                            metadata.description = text;
                            console.log(`✅ Found valid description in generic div: ${text.substring(0, 100)}...`);
                            break;
                        }
                    }
                }

                if (!metadata.description) {
                    console.log('❌ No valid description found in any strategy');
                }

                // Extract metadata from dt/dd elements
                const dtElements = document.querySelectorAll('dt');
                dtElements.forEach(dt => {
                    const dtText = dt.textContent.trim().toLowerCase();
                    const dd = dt.nextElementSibling;

                    if (dd && dd.tagName === 'DD') {
                        const ddText = dd.textContent.trim();

                        if (dtText.includes('type') && !metadata.type) {
                            const typeLink = dd.querySelector('a');
                            metadata.type = typeLink ? typeLink.textContent.trim() : ddText;
                        }

                        if (dtText.includes('genre') && !metadata.genres) {
                            const genreLinks = dd.querySelectorAll('a[href*="/genere/"]');

                            if (genreLinks.length > 0) {
                                const genres = Array.from(genreLinks)
                                    .map(link => link.textContent.trim())
                                    .filter(text => text.length > 0 && text.length < 30)
                                    .slice(0, 6);

                                if (genres.length > 0) {
                                    metadata.genres = genres.join(', ');
                                }
                            }
                        }

                        if (dtText.includes('country') && !metadata.country) {
                            const countryLink = dd.querySelector('a');
                            const countryText = countryLink ? countryLink.textContent.trim() : ddText;

                            if (countryText.toLowerCase().includes('japan')) {
                                metadata.country = 'Japan';
                            } else if (countryText.toLowerCase().includes('china')) {
                                metadata.country = 'China';
                            } else if (countryText.toLowerCase().includes('korea')) {
                                metadata.country = 'Korea';
                            } else {
                                metadata.country = countryText;
                            }
                        }

                        if (dtText.includes('status') && !metadata.status) {
                            const statusLink = dd.querySelector('a');
                            metadata.status = statusLink ? statusLink.textContent.trim() : ddText;
                        }

                        if (dtText.includes('released') && !metadata.released) {
                            const releasedLink = dd.querySelector('a');
                            metadata.released = releasedLink ? releasedLink.textContent.trim() : ddText;
                        }
                    }
                });

                // Try alternative metadata extraction if dt/dd didn't work
                if (!metadata.type || !metadata.genres || !metadata.country || !metadata.status || !metadata.released) {
                    const metaRows = document.querySelectorAll('.meta .col-sm-12');

                    metaRows.forEach(row => {
                        const rowText = row.textContent.trim();

                        if (rowText.toLowerCase().includes('type:') && !metadata.type) {
                            const typeLink = row.querySelector('a');
                            if (typeLink) {
                                metadata.type = typeLink.textContent.trim();
                            }
                        }

                        if (rowText.toLowerCase().includes('genre:') && !metadata.genres) {
                            const genreLinks = row.querySelectorAll('a[href*="/genere/"]');
                            if (genreLinks.length > 0) {
                                const genres = Array.from(genreLinks)
                                    .map(link => link.textContent.trim())
                                    .filter(text => text.length > 0 && text.length < 30)
                                    .slice(0, 6);

                                if (genres.length > 0) {
                                    metadata.genres = genres.join(', ');
                                }
                            }
                        }

                        if (rowText.toLowerCase().includes('country:') && !metadata.country) {
                            const countryLink = row.querySelector('a');
                            if (countryLink) {
                                const countryText = countryLink.textContent.trim();
                                if (countryText.toLowerCase().includes('japan')) {
                                    metadata.country = 'Japan';
                                } else if (countryText.toLowerCase().includes('china')) {
                                    metadata.country = 'China';
                                } else if (countryText.toLowerCase().includes('korea')) {
                                    metadata.country = 'Korea';
                                } else {
                                    metadata.country = countryText;
                                }
                            }
                        }

                        if (rowText.toLowerCase().includes('status:') && !metadata.status) {
                            const statusLink = row.querySelector('a');
                            if (statusLink) {
                                metadata.status = statusLink.textContent.trim();
                            }
                        }

                        if (rowText.toLowerCase().includes('released:') && !metadata.released) {
                            const releasedLink = row.querySelector('a');
                            if (releasedLink) {
                                metadata.released = releasedLink.textContent.trim();
                            }
                        }
                    });
                }

                // Clean up metadata
                Object.keys(metadata).forEach(key => {
                    if (metadata[key]) {
                        metadata[key] = metadata[key]
                            .replace(/\n/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                        if (key === 'description') {
                            const cleanupPatterns = [
                                /you can also use the keyboard shortcuts.*/gi,
                                /keyboard shortcuts to control.*/gi,
                                /control the player.*/gi,
                                /one way or another, keep comments.*/gi,
                                /comments related to the anime.*/gi,
                                /about 123animes in general.*/gi,
                                /\[written by.*?\]/gi,
                                /\(written by.*?\)/gi,
                                /less$/gi,
                                /more$/gi,
                                /show more$/gi,
                                /show less$/gi
                            ];

                            for (const pattern of cleanupPatterns) {
                                metadata[key] = metadata[key].replace(pattern, '').trim();
                            }

                            if (metadata[key].length < 50) {
                                console.log(`❌ Description too short after cleanup: "${metadata[key]}"`);
                                metadata[key] = null;
                            } else if (metadata[key].length > 1200) {
                                metadata[key] = metadata[key].substring(0, 1200) + '...';
                                console.log(`✂️ Truncated description to 1200 characters`);
                            }
                        }
                    }
                });

                return metadata;
            };

            return extractMetadata();
        });

        return metadata;

    } catch (error) {
        console.error(`❌ Error extracting metadata: ${error.message}`);
        return {
            type: null,
            genres: null,
            country: null,
            status: null,
            released: null,
            description: null
        };
    } finally {
        await page.close();
    }
};