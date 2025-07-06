import puppeteer from 'puppeteer';
import pLimit from 'p-limit';
import { saveAnime } from './database/services/animeService.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeFilmList = async (baseUrl = 'https://w1.123animes.ru/az-all-anime/all/') => {
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
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();

            if (['stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
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
                            index: index + 1,
                            title: title,
                            anime_redirect_link: redirectLink,
                            episodes: episodes,
                            image: imageSrc,
                            audio_type: audioType
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

        console.log('📊 Extracting detailed metadata for each anime with 10 concurrent workers...');
        const detailedAnimeList = await extractDetailedMetadata(animeList, browser);

        return detailedAnimeList;

    } catch (error) {
        console.error('❌ Error scraping film list:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};

const extractDetailedMetadata = async (animeList, browser) => {
    const detailedAnimeList = [];
    const limit = pLimit(10);

    console.log(`🚀 Processing ${animeList.length} anime with 10 concurrent workers...`);

    const promises = animeList.map((anime, index) =>
        limit(async () => {
            console.log(`🔗 Processing anime ${index + 1}/${animeList.length}: ${anime.title}`);

            try {
                const result = await extractAnimeMetadata(anime, browser);
                console.log(`    ✅ Completed anime ${index + 1}/${animeList.length}: ${anime.title}`);
                return result;
            } catch (error) {
                console.log(`    ❌ Failed anime ${index + 1}/${animeList.length}: ${anime.title} - ${error.message}`);
                return {
                    ...anime,
                    type: null,
                    genres: null,
                    country: null,
                    status: null,
                    released: null,
                    description: null
                };
            }
        })
    );

    const results = await Promise.all(promises);

    detailedAnimeList.push(...results);

    console.log(`✅ Completed processing all ${animeList.length} anime`);
    console.log(`📊 Successfully extracted metadata for ${detailedAnimeList.filter(a => a.type || a.genres).length}/${animeList.length} anime`);
    console.log(`📝 Successfully extracted descriptions for ${detailedAnimeList.filter(a => a.description).length}/${animeList.length} anime`);

    return detailedAnimeList;
};

const extractAnimeMetadata = async (anime, browser) => {
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

                // Strategy 1: Look for div.long
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

                // Strategy 2: Look for div.short
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

                // Strategy 3: Look for common description containers
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

                // Strategy 4: Look in tooltipster elements
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

                // Strategy 5: Look in content areas
                if (!metadata.description) {
                    console.log('🔍 Looking in content areas...');
                    const contentAreas = document.querySelectorAll('.content, .main-content, .post-content, .entry-content, .article-content, .info, .details');

                    for (const area of contentAreas) {
                        const paragraphs = area.querySelectorAll('p, div');

                        for (const element of paragraphs) {
                            const text = element.textContent.trim();

                            // Skip elements inside control/player areas
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

                // Strategy 6: Look for any div with substantial text
                if (!metadata.description) {
                    console.log('🔍 Looking for any div with substantial text...');
                    const allDivs = document.querySelectorAll('div');

                    for (const div of allDivs) {
                        // Skip complex divs with many children
                        if (div.children.length > 2) continue;

                        const text = div.textContent.trim();

                        // Skip short text
                        if (text.length < 100) continue;

                        // Skip control/player areas
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

                // Extract other metadata from dt/dd elements
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

                // Fallback: Try alternative selectors for metadata
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

        const finalAnimeData = {
            ...anime,
            ...metadata,
            category: 'general',
            source: '123animes'
        };

        // 🚀 AUTO-SAVE TO DATABASE IMMEDIATELY AFTER PROCESSING
        try {
            await saveAnime(finalAnimeData);
            console.log(`    💾 Saved to database: ${anime.title}`);
        } catch (saveError) {
            console.error(`    ❌ Failed to save to database: ${anime.title} - ${saveError.message}`);
        }

        return finalAnimeData;

    } catch (error) {
        // Even if metadata extraction fails, save basic anime info
        const basicAnimeData = {
            ...anime,
            type: null,
            genres: null,
            country: null,
            status: null,
            released: null,
            description: null,
            category: 'general',
            source: '123animes'
        };

        try {
            await saveAnime(basicAnimeData);
            console.log(`    💾 Saved basic data to database: ${anime.title}`);
        } catch (saveError) {
            console.error(`    ❌ Failed to save basic data: ${anime.title} - ${saveError.message}`);
        }

        throw new Error(`Failed to extract metadata: ${error.message}`);
    } finally {
        await page.close();
    }
};