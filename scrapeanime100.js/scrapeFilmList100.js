import puppeteer from 'puppeteer';
import pLimit from 'p-limit';
import { saveAnime } from '../database/services/animeService.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeFilmList100 = async (startPage = 1, endPage = 501) => {
    console.log(`🚀 Starting to scrape pages ${startPage} to ${endPage} (${endPage - startPage + 1} pages total)`);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu',
            '--no-first-run',
            '--disable-web-security',
            '--disable-features=site-per-process',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows'
        ]
    });

    const pageLimit = pLimit(4);
    const metadataLimit = pLimit(8); 
    
    let totalProcessed = 0;
    let totalSaved = 0;
    const startTime = Date.now();
    
    try {
        console.log(`📊 Creating page processing queue for ${endPage - startPage + 1} pages...`);
        
        const pagePromises = [];
        
        for (let page = startPage; page <= endPage; page++) {
            const promise = pageLimit(async () => {
                const pageUrl = `https://w1.123animes.ru/az-all-anime/all/?page=${page}`;
                console.log(`📄 Processing page ${page}/${endPage} - ${pageUrl}`);
                
                const animeList = await scrapeSinglePage(browser, pageUrl, page);
                
                if (animeList.length > 0) {
                    console.log(`✅ Page ${page} completed: Found ${animeList.length} anime`);
                    totalProcessed += animeList.length;
                    
                    const processedAnime = await extractDetailedMetadataBatch(animeList, browser, metadataLimit, page);
                    totalSaved += processedAnime.filter(a => a.saved).length;
                    
                    return {
                        page: page,
                        anime: processedAnime,
                        count: animeList.length
                    };
                } else {
                    console.log(`⚠️ Page ${page} returned no anime`);
                    return {
                        page: page,
                        anime: [],
                        count: 0
                    };
                }
            });
            
            pagePromises.push(promise);
        }
        
        console.log(`⏳ Processing all ${pagePromises.length} pages concurrently...`);
        
        const results = await Promise.allSettled(pagePromises);
        
        let successfulPages = 0;
        let failedPages = 0;
        let totalAnimeFound = 0;
        
        results.forEach((result, index) => {
            const pageNumber = startPage + index;
            
            if (result.status === 'fulfilled') {
                successfulPages++;
                totalAnimeFound += result.value.count;
                console.log(`✅ Page ${pageNumber}: ${result.value.count} anime processed`);
            } else {
                failedPages++;
                console.error(`❌ Page ${pageNumber} failed: ${result.reason.message}`);
            }
        });
        
        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000 / 60;
        
        console.log(`\n🎉 SCRAPING COMPLETED!`);
        console.log(`📊 Summary:`);
        console.log(`   • Total pages processed: ${successfulPages}/${endPage - startPage + 1}`);
        console.log(`   • Failed pages: ${failedPages}`);
        console.log(`   • Total anime found: ${totalAnimeFound}`);
        console.log(`   • Total anime saved: ${totalSaved}`);
        console.log(`   • Success rate: ${((successfulPages / (endPage - startPage + 1)) * 100).toFixed(2)}%`);
        console.log(`   • Total processing time: ${totalTime.toFixed(2)} minutes`);
        console.log(`   • Average time per page: ${(totalTime / successfulPages).toFixed(2)} minutes`);
        
        return {
            success: true,
            pages_processed: successfulPages,
            pages_failed: failedPages,
            total_anime_found: totalAnimeFound,
            total_anime_saved: totalSaved,
            success_rate: ((successfulPages / (endPage - startPage + 1)) * 100).toFixed(2),
            total_time_minutes: totalTime.toFixed(2)
        };
        
    } catch (error) {
        console.error('❌ Fatal error during batch scraping:', error.message);
        return {
            success: false,
            error: error.message,
            pages_processed: 0,
            total_anime_found: 0
        };
    } finally {
        await browser.close();
        console.log(`🔒 Browser closed`);
    }
};

const scrapeSinglePage = async (browser, url, pageNumber) => {
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();
            
            if (['stylesheet', 'font', 'media', 'image'].includes(resourceType) ||
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

        console.log(`   🌐 Loading page ${pageNumber}...`);
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        try {
            await page.waitForSelector('.film-list', { timeout: 10000 });
        } catch (e) {
            console.log(`   ⚠️ Page ${pageNumber}: Film list container not found, trying alternatives...`);
            const alternatives = ['.container', '.main-content', '.content', '#content'];
            for (const selector of alternatives) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    console.log(`   ✅ Page ${pageNumber}: Found alternative container: ${selector}`);
                    break;
                } catch (err) {
                    continue;
                }
            }
        }

        await delay(2500);

        console.log(`   🔍 Extracting anime from page ${pageNumber}...`);
        const animeList = await page.evaluate((pageNum) => {
            const filmList = document.querySelector('.film-list');
            const items = filmList ? filmList.querySelectorAll('.item') : document.querySelectorAll('.item');
            const animeData = [];

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
                    const imgElement = firstLink.querySelector('img');

                    if (imgElement) {
                        imageSrc = imgElement.getAttribute('data-src') ||
                            imgElement.getAttribute('data-original') ||
                            imgElement.getAttribute('data-lazy') ||
                            imgElement.getAttribute('src') ||
                            imgElement.src;
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
                            audio_type: audioType,
                            page: pageNum
                        });
                    }
                }
            });

            return animeData.filter((anime, index, self) =>
                index === self.findIndex(a => a.anime_redirect_link === anime.anime_redirect_link)
            );
        }, pageNumber);

        console.log(`   ✅ Page ${pageNumber}: Found ${animeList.length} unique anime`);
        return animeList;

    } catch (error) {
        console.error(`   ❌ Page ${pageNumber} failed: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
};

const extractDetailedMetadataBatch = async (animeList, browser, limit, pageNumber) => {
    console.log(`   🚀 Processing metadata for ${animeList.length} anime from page ${pageNumber}...`);
    
    const promises = animeList.map((anime, index) =>
        limit(async () => {
            try {
                const result = await extractAnimeMetadataWithRetry(anime, browser, 2);
                console.log(`      ✅ Page ${pageNumber} - Anime ${index + 1}/${animeList.length}: ${anime.title}`);
                return { ...result, saved: true };
            } catch (error) {
                console.log(`      ❌ Page ${pageNumber} - Anime ${index + 1}/${animeList.length}: ${anime.title} - ${error.message}`);
                
                const basicData = {
                    ...anime,
                    type: null,
                    genres: null,
                    country: null,
                    status: null,
                    released: null,
                    description: "No description available for this anime.",
                    category: 'general',
                    source: '123animes'
                };
                
                try {
                    await saveAnime(basicData);
                    return { ...basicData, saved: true };
                } catch (saveError) {
                    return { ...basicData, saved: false };
                }
            }
        })
    );

    const results = await Promise.all(promises);
    console.log(`   ✅ Page ${pageNumber}: Completed metadata processing for ${results.length} anime`);
    
    return results;
};

const extractAnimeMetadataWithRetry = async (anime, browser, maxRetries = 2) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await extractAnimeMetadataFast(anime, browser, attempt);
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                console.log(`      🔄 Retry ${attempt}/${maxRetries} for: ${anime.title}`);
                await delay(3000 * attempt);
            }
        }
    }
    
    throw lastError;
};

const extractAnimeMetadataFast = async (anime, browser, attempt = 1) => {
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();
            if (['image', 'media', 'font'].includes(resourceType) ||
                url.includes('google-analytics') ||
                url.includes('googletagmanager') ||
                url.includes('doubleclick') ||
                url.includes('adsystem') ||
                url.includes('googlesyndication')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setViewport({ width: 1280, height: 720 });

        const timeout = 30000 + (attempt * 15000);
        console.log(`        🌐 Loading metadata page (attempt ${attempt}, timeout: ${timeout/1000}s): ${anime.anime_redirect_link}`);
        
        await page.goto(anime.anime_redirect_link, {
            waitUntil: 'domcontentloaded',
            timeout: timeout
        });

        await delay(3000);

        const metadata = await page.evaluate((animeTitle) => {
            const metadata = {
                type: null,
                genres: null,
                country: null,
                status: null,
                released: null,
                description: null
            };

            const descriptionSelectors = [
                '.long', '.short', '.description', '.synopsis', '.summary', '.overview',
                '.anime-description', '.story', 'p.dses', '.plot-summary',
                '[class*="description"]', '[class*="synopsis"]', '.detail .content',
                '.detail-content', '.info .description'
            ];

            for (const selector of descriptionSelectors) {
                const element = document.querySelector(selector);
                if (element && !metadata.description) {
                    const text = element.textContent.trim();
                    if (
                        text.length > 30 && text.length < 3000 &&
                        !/keyboard shortcuts|control the player|video player|click here to|loading|episode/i.test(text) &&
                        (
                            /story|follows|world|life|adventure|anime|character|young/i.test(text) ||
                            text.split(' ').length > 8
                        )
                    ) {
                        metadata.description = text;
                        break;
                    }
                }
            }

            if (metadata.description) {
                metadata.description = metadata.description.replace(/(You can also use the keyboard shortcuts.*|Keyboard shortcuts to control.*|Control the player.*|One way or another, keep comments.*|Comments related to the anime.*|About 123animes in general.*)/gi, '').trim();
            }

            // --- NEW: Extract and append keyword description if present ---
            let keywordText = null;
            // Try to find a block containing "Keywords:"
            const keywordSelectors = [
                'div', 'p', 'span', '.keywords', '[class*="keyword"]'
            ];
            for (const selector of keywordSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (el.textContent && el.textContent.trim().startsWith('Keywords:')) {
                        keywordText = el.textContent.trim();
                        break;
                    }
                }
                if (keywordText) break;
            }
            // If not found, try to find any text node containing "Keywords:"
            if (!keywordText) {
                const allText = document.body.textContent;
                const match = allText.match(/Keywords:[^\n]+/i);
                if (match) keywordText = match[0].trim();
            }
            if (keywordText) {
                if (metadata.description && !metadata.description.includes(keywordText)) {
                    metadata.description += '\n\n' + keywordText;
                } else if (!metadata.description) {
                    metadata.description = keywordText;
                }
            }
            // --- END KEYWORD EXTRACTION ---

            const dtElements = document.querySelectorAll('dt');
            dtElements.forEach(dt => {
                const dtText = dt.textContent.trim().toLowerCase();
                const dd = dt.nextElementSibling;

                if (dd && dd.tagName === 'DD') {
                    const ddText = dd.textContent.trim();

                    if ((dtText.includes('type') || dtText.includes('format') || dtText.includes('kind')) && !metadata.type) {
                        const typeLink = dd.querySelector('a');
                        let typeText = typeLink ? typeLink.textContent.trim() : ddText;
                        if (typeText && typeText.length < 50) {
                            metadata.type = typeText;
                        }
                    }

                    if ((dtText.includes('genre') || dtText.includes('category') || dtText.includes('tag')) && !metadata.genres) {
                        const genreLinks = dd.querySelectorAll('a');
                        if (genreLinks.length > 0) {
                            const genres = Array.from(genreLinks)
                                .map(link => link.textContent.trim())
                                .filter(text => text.length > 0 && text.length < 30 && !text.toLowerCase().includes('view all'))
                                .slice(0, 8);
                            if (genres.length > 0) {
                                metadata.genres = genres.join(', ');
                            }
                        } else if (ddText && ddText.length > 0 && ddText.length < 200) {
                            const genreText = ddText.split(',').map(g => g.trim()).filter(g => g.length > 0).slice(0, 6).join(', ');
                            if (genreText) {
                                metadata.genres = genreText;
                            }
                        }
                    }

                    if ((dtText.includes('country') || dtText.includes('origin') || dtText.includes('nation')) && !metadata.country) {
                        const countryLink = dd.querySelector('a');
                        const countryText = countryLink ? countryLink.textContent.trim() : ddText;
                        
                        if (countryText && countryText.length < 100) {
                            const lowerCountry = countryText.toLowerCase();
                            if (lowerCountry.includes('japan') || lowerCountry.includes('jp') || lowerCountry.includes('japanese')) {
                                metadata.country = 'Japan';
                            } else if (lowerCountry.includes('china') || lowerCountry.includes('cn') || lowerCountry.includes('chinese')) {
                                metadata.country = 'China';
                            } else if (lowerCountry.includes('korea') || lowerCountry.includes('kr') || lowerCountry.includes('korean')) {
                                metadata.country = 'Korea';
                            } else if (lowerCountry.includes('usa') || lowerCountry.includes('america') || lowerCountry.includes('us')) {
                                metadata.country = 'USA';
                            } else {
                                metadata.country = countryText;
                            }
                        }
                    }

                    if ((dtText.includes('status') || dtText.includes('state')) && !metadata.status) {
                        const statusLink = dd.querySelector('a');
                        let statusText = statusLink ? statusLink.textContent.trim() : ddText;
                        if (statusText && statusText.length < 50) {
                            metadata.status = statusText;
                        }
                    }

                    if ((dtText.includes('released') || dtText.includes('aired') || dtText.includes('year') || dtText.includes('date')) && !metadata.released) {
                        const releasedLink = dd.querySelector('a');
                        let releasedText = releasedLink ? releasedLink.textContent.trim() : ddText;
                        if (releasedText && releasedText.length < 50) {
                            metadata.released = releasedText;
                        }
                    }
                }
            });

            if (!metadata.type) {
                const typeSelectors = ['.type', '.format', '[data-type]', '.anime-type', '.kind'];
                for (const selector of typeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const typeText = element.textContent.trim();
                        if (typeText && typeText.length < 50) {
                            metadata.type = typeText;
                            break;
                        }
                    }
                }
            }

            if (!metadata.genres) {
                const genreSelectors = ['.genres', '.genre-list', '.categories', '.tags'];
                for (const selector of genreSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const genreLinks = element.querySelectorAll('a');
                        if (genreLinks.length > 0) {
                            const genres = Array.from(genreLinks)
                                .map(link => link.textContent.trim())
                                .filter(text => text.length > 0 && text.length < 30)
                                .slice(0, 6);
                            if (genres.length > 0) {
                                metadata.genres = genres.join(', ');
                                break;
                            }
                        }
                    }
                }
            }

            if (!metadata.country) {
                const pageText = document.body.textContent.toLowerCase();
                if (pageText.includes('japanese') || pageText.includes('japan')) {
                    metadata.country = 'Japan';
                } else if (pageText.includes('chinese') || pageText.includes('china')) {
                    metadata.country = 'China';
                } else if (pageText.includes('korean') || pageText.includes('korea')) {
                    metadata.country = 'Korea';
                }
            }

            if (!metadata.type && animeTitle) {
                const titleLower = animeTitle.toLowerCase();
                if (titleLower.includes('movie') || titleLower.includes('film')) {
                    metadata.type = 'Movie';
                } else if (titleLower.includes('ova')) {
                    metadata.type = 'OVA';
                } else if (titleLower.includes('special')) {
                    metadata.type = 'Special';
                } else {
                    metadata.type = 'TV Series';
                }
            }

            if (!metadata.description) {
                metadata.description = "No description available for this anime.";
            }

            return metadata;
        }, anime.title);

        const finalAnimeData = {
            ...anime,
            ...metadata,
            category: 'general',
            source: '123animes'
        };

        await saveAnime(finalAnimeData);
        
        return finalAnimeData;

    } catch (error) {
        console.log(`        ❌ Metadata extraction failed: ${error.message}`);
        throw error;
    } finally {
        await page.close();
    }
};

export const updateMissingMetadata = async (limit = 20) => {
    console.log(`🔄 Starting to update anime with missing metadata...`);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu'
        ]
    });

    try {
        const { getAnimeWithMissingMetadata } = await import('./database/services/animeService.js');
        
        const animeToUpdate = await getAnimeWithMissingMetadata(limit);
        console.log(`📋 Found ${animeToUpdate.length} anime with missing metadata`);

        if (animeToUpdate.length === 0) {
            console.log(`✅ No anime found with missing metadata!`);
            return {
                success: true,
                updated: 0,
                total: 0,
                message: 'No anime with missing metadata found'
            };
        }

        const updateLimit = pLimit(2);
        
        const updatePromises = animeToUpdate.map((anime, index) =>
            updateLimit(async () => {
                try {
                    console.log(`🔄 Updating ${index + 1}/${animeToUpdate.length}: ${anime.title}`);
                    const result = await extractAnimeMetadataFast(anime, browser, 1);
                    console.log(`✅ Updated: ${anime.title}`);
                    return { success: true, anime: result };
                } catch (error) {
                    console.log(`❌ Failed to update: ${anime.title} - ${error.message}`);
                    return { success: false, anime: anime };
                }
            })
        );

        const results = await Promise.all(updatePromises);
        const successful = results.filter(r => r.success).length;
        
        console.log(`🎉 Metadata update completed!`);
        console.log(`✅ Successfully updated: ${successful}/${animeToUpdate.length} anime`);
        
        return {
            success: true,
            updated: successful,
            total: animeToUpdate.length,
            success_rate: ((successful / animeToUpdate.length) * 100).toFixed(2)
        };

    } finally {
        await browser.close();
    }
};

export const scrapeAll501Pages = async () => {
    console.log(`🎬 Starting to scrape all 501 pages of anime...`);
    const startTime = Date.now();
    
    const result = await scrapeFilmList100(1, 501);
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000 / 60;
    
    console.log(`\n⏱️ Total scraping time: ${totalTime.toFixed(2)} minutes`);
    console.log(`📈 Average time per page: ${(totalTime / 501).toFixed(2)} minutes`);
    
    return result;
};

export const scrapeInBatches = async (batchSize = 10) => {
    console.log(`🎬 Starting to scrape 501 pages in batches of ${batchSize}...`);
    
    let allResults = {
        success: true,
        total_pages_processed: 0,
        total_pages_failed: 0,
        total_anime_found: 0,
        total_anime_saved: 0,
        batches: [],
        start_time: new Date().toISOString()
    };
    
    for (let startPage = 1; startPage <= 501; startPage += batchSize) {
        const endPage = Math.min(startPage + batchSize - 1, 501);
        
        console.log(`\n🔄 Processing batch: pages ${startPage} to ${endPage}`);
        
        const batchResult = await scrapeFilmList100(startPage, endPage);
        
        allResults.total_pages_processed += batchResult.pages_processed || 0;
        allResults.total_pages_failed += batchResult.pages_failed || 0;
        allResults.total_anime_found += batchResult.total_anime_found || 0;
        allResults.total_anime_saved += batchResult.total_anime_saved || 0;
        allResults.batches.push(batchResult);
        
        console.log(`✅ Batch completed: ${batchResult.pages_processed} pages processed`);
        
        if (startPage + batchSize <= 501) {
            console.log(`⏳ Waiting 10 seconds before next batch...`);
            await delay(10000);
        }
    }
    
    allResults.end_time = new Date().toISOString();
    
    console.log(`\n🎉 ALL BATCHES COMPLETED!`);
    console.log(`📊 Final Summary:`);
    console.log(`   • Total pages processed: ${allResults.total_pages_processed}/501`);
    console.log(`   • Total pages failed: ${allResults.total_pages_failed}`);
    console.log(`   • Total anime found: ${allResults.total_anime_found}`);
    console.log(`   • Total anime saved: ${allResults.total_anime_saved}`);
    console.log(`   • Overall success rate: ${((allResults.total_pages_processed / 501) * 100).toFixed(2)}%`);
    
    return allResults;
};