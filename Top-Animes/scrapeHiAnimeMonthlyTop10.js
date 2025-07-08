import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const scrapeHiAnimeMonthlyTop10 = async () => {
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

        console.log('🔍 Scraping HiAnime monthly top 10 titles...');
        
        // Get monthly top 10 titles from HiAnime
        const hiAnimeMonthlyTitles = await page.evaluate(() => {
            const results = [];
            const processedTitles = new Set();
            
            // Get monthly top anime section
            const monthlySection = document.querySelector('#top-viewed-month.anif-block-ul.anif-block-chart.tab-pane');
            if (monthlySection) {
                console.log('✅ Found monthly section');
                
                // Get top items (rank 1-3)
                const topItems = monthlySection.querySelectorAll('.item-top');
                console.log(`Found ${topItems.length} top items`);
                
                topItems.forEach((item, index) => {
                    if (results.length >= 10) return;
                    
                    try {
                        const titleElement = item.querySelector('.film-name a');
                        const title = titleElement ? titleElement.textContent.trim() : null;
                        
                        if (title && !processedTitles.has(title)) {
                            processedTitles.add(title);
                            results.push({
                                title: title,
                                rank: index + 1,
                                category: 'top'
                            });
                            console.log(`Added top item ${index + 1}: "${title}"`);
                        }
                    } catch (error) {
                        console.log(`Error processing top item ${index + 1}:`, error.message);
                    }
                });
                
                // Get regular list items (rank 4-10)
                const listItems = monthlySection.querySelectorAll('li:not(.item-top)');
                console.log(`Found ${listItems.length} regular list items`);
                
                listItems.forEach((item, index) => {
                    if (results.length >= 10) return;
                    
                    try {
                        const titleElement = item.querySelector('.film-name a, .dynamic-name, a[title], a');
                        const title = titleElement ? (titleElement.textContent.trim() || titleElement.getAttribute('title')) : null;
                        
                        if (title && title.length > 3 && !processedTitles.has(title)) {
                            processedTitles.add(title);
                            results.push({
                                title: title,
                                rank: results.length + 1,
                                category: 'regular'
                            });
                            console.log(`Added regular item ${results.length}: "${title}"`);
                        }
                    } catch (error) {
                        console.log(`Error processing list item ${index + 1}:`, error.message);
                    }
                });
            } else {
                console.log('❌ Monthly section not found');
            }
            
            // Alternative selector if the first one doesn't work
            if (results.length === 0) {
                console.log('🔄 Trying alternative selectors...');
                
                const alternativeMonthlySection = document.querySelector('[id*="top-viewed-month"]');
                if (alternativeMonthlySection) {
                    console.log('✅ Found alternative monthly section');
                    
                    const allItems = alternativeMonthlySection.querySelectorAll('li');
                    console.log(`Found ${allItems.length} items in alternative section`);
                    
                    allItems.forEach((item, index) => {
                        if (results.length >= 10) return;
                        
                        try {
                            const titleElement = item.querySelector('.film-name a, a[title], a');
                            const title = titleElement ? (titleElement.textContent.trim() || titleElement.getAttribute('title')) : null;
                            
                            if (title && title.length > 3 && !processedTitles.has(title)) {
                                processedTitles.add(title);
                                results.push({
                                    title: title,
                                    rank: results.length + 1,
                                    category: 'alternative'
                                });
                                console.log(`Added alternative item ${results.length}: "${title}"`);
                            }
                        } catch (error) {
                            console.log(`Error processing alternative item ${index + 1}:`, error.message);
                        }
                    });
                }
            }
            
            return results;
        });

        console.log(`✅ Got ${hiAnimeMonthlyTitles.length} monthly titles from HiAnime:`);
        hiAnimeMonthlyTitles.forEach(item => {
            console.log(`  ${item.rank}. "${item.title}" (${item.category})`);
        });

        // Extract just the titles for metadata fetching
        const titlesList = hiAnimeMonthlyTitles.map(item => item.title);

        // Now get detailed metadata from 123animes.ru
        console.log('🔍 Getting detailed metadata from 123animes.ru...');
        const detailedAnimeList = await getDetailedMetadataFrom123Anime(titlesList, browser);

        // Add ranking information to the detailed results
        const finalResults = detailedAnimeList.map((anime, index) => ({
            ...anime,
            monthly_rank: hiAnimeMonthlyTitles[index]?.rank || index + 1,
            category: hiAnimeMonthlyTitles[index]?.category || 'unknown'
        }));

        return finalResults;

    } catch (error) {
        console.error('❌ Error scraping HiAnime monthly:', error.message);
        
        // Return fallback data if scraping fails
        return [
            {
                index: 1,
                title: "Monthly Scraping Error",
                anime_redirect_link: "https://hianime.to",
                episodes: "N/A",
                image: null,
                audio_type: "SUB",
                type: "Error",
                genres: "N/A",
                country: "N/A",
                status: "N/A",
                released: "N/A",
                description: `Error occurred while scraping monthly: ${error.message}`,
                monthly_rank: 1,
                category: 'error'
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

        console.log('🔍 Extracting anime metadata from 123animes.ru...');
        const animeMetadata = await page.evaluate(() => {
            const filmList = document.querySelector('.film-list');
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

                    // Extract image
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
                    }
                }
            });

            return animeData;
        });

        console.log(`✅ Found ${animeMetadata.length} anime from 123animes.ru`);

        // Match HiAnime titles with 123anime metadata
        const matchedAnime = [];
        const limit = pLimit(3);

        for (let i = 0; i < Math.min(titles.length, 10); i++) {
            const hiAnimeTitle = titles[i];
            
            console.log(`\n🔍 [${i + 1}/${titles.length}] Matching monthly title: "${hiAnimeTitle}"`);
            
            // Find best match from 123anime
            const bestMatch = findBestMatch(hiAnimeTitle, animeMetadata);
            
            if (bestMatch) {
                console.log(`🔗 Matched "${hiAnimeTitle}" with "${bestMatch.title}"`);
                
                // Get detailed metadata from the anime page
                const detailedMetadata = await limit(() => 
                    extractDetailedMetadata(bestMatch, browser)
                );

                matchedAnime.push({
                    index: i + 1,
                    title: hiAnimeTitle,
                    anime_redirect_link: bestMatch.anime_redirect_link,
                    episodes: bestMatch.episodes || 'N/A',
                    image: bestMatch.image,
                    audio_type: bestMatch.audio_type || 'SUB',
                    type: detailedMetadata.type || 'TV Series',
                    genres: detailedMetadata.genres || 'Action, Adventure',
                    country: detailedMetadata.country || 'Japan',
                    status: detailedMetadata.status || 'Ongoing',
                    released: detailedMetadata.released || '2024',
                    description: detailedMetadata.description || `${hiAnimeTitle} - Popular monthly anime from HiAnime.`
                });
            } else {
                console.log(`❌ No match found for "${hiAnimeTitle}"`);
                
                // Use fallback
                const fallbackAnime = animeMetadata[i % animeMetadata.length];
                
                if (fallbackAnime) {
                    const detailedMetadata = await limit(() => 
                        extractDetailedMetadata(fallbackAnime, browser)
                    );

                    matchedAnime.push({
                        index: i + 1,
                        title: hiAnimeTitle,
                        anime_redirect_link: fallbackAnime.anime_redirect_link,
                        episodes: fallbackAnime.episodes || 'N/A',
                        image: fallbackAnime.image,
                        audio_type: fallbackAnime.audio_type || 'SUB',
                        type: detailedMetadata.type || 'TV Series',
                        genres: detailedMetadata.genres || 'Action, Adventure',
                        country: detailedMetadata.country || 'Japan',
                        status: detailedMetadata.status || 'Ongoing',
                        released: detailedMetadata.released || '2024',
                        description: detailedMetadata.description || `${hiAnimeTitle} - Popular monthly anime from HiAnime.`
                    });
                } else {
                    // Last resort fallback
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
                        description: `${hiAnimeTitle} - Popular monthly anime from HiAnime.`
                    });
                }
            }
        }

        return matchedAnime;

    } catch (error) {
        console.error('❌ Error getting metadata from 123animes.ru:', error.message);
        
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
            description: `${title} - Popular monthly anime from HiAnime.`
        }));
    } finally {
        await page.close();
    }
};

const findBestMatch = (hiAnimeTitle, animeMetadata) => {
    const cleanTitle = (title) => {
        return title.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const cleanHiAnimeTitle = cleanTitle(hiAnimeTitle);
    
    // Find exact match first
    let bestMatch = animeMetadata.find(anime => {
        const cleanAnimeTitle = cleanTitle(anime.title);
        return cleanAnimeTitle === cleanHiAnimeTitle;
    });

    if (bestMatch) return bestMatch;

    // Find partial match
    bestMatch = animeMetadata.find(anime => {
        const cleanAnimeTitle = cleanTitle(anime.title);
        return cleanAnimeTitle.includes(cleanHiAnimeTitle) || 
               cleanHiAnimeTitle.includes(cleanAnimeTitle);
    });

    if (bestMatch) return bestMatch;

    // Find by first word match
    const firstWord = cleanHiAnimeTitle.split(' ')[0];
    if (firstWord.length > 3) {
        bestMatch = animeMetadata.find(anime => {
            const cleanAnimeTitle = cleanTitle(anime.title);
            return cleanAnimeTitle.startsWith(firstWord);
        });
    }

    return bestMatch;
};

const extractDetailedMetadata = async (anime, browser) => {
    const page = await browser.newPage();

    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
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
            const metadata = {
                type: null,
                genres: null,
                country: null,
                status: null,
                released: null,
                description: null
            };

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

            // Try to find description
            const descriptionSelectors = [
                'div.long',
                'div.short',
                '.description',
                '.synopsis',
                '.dses',
                'p.dses'
            ];

            for (const selector of descriptionSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const text = element.textContent.trim();
                    if (text.length > 50 && text.length < 1500) {
                        metadata.description = text;
                        break;
                    }
                }
            }

            return metadata;
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