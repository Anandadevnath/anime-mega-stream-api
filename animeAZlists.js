import puppeteer from 'puppeteer';

export const AnimeAZ = async (pageNum = 1) => {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-images',
            '--disable-css',
            '--disable-javascript',
            '--no-first-run',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });

    try {
        const mainPage = await browser.newPage();
        await mainPage.goto(`https://w1.123animes.ru/az-all-anime/all/?page=${pageNum}`, { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
        });
        await mainPage.waitForSelector('.film-list');

        const animeList = await mainPage.evaluate(() => {
            return Array.from(document.querySelectorAll('.film-list .item .inner'))
                .map(inner => {
                    const links = inner.querySelectorAll('a[href]');
                    if (links.length >= 2) {
                        const firstLink = links[0];
                        const secondLink = links[1];

                        const img = firstLink.querySelector('img');
                        let imageSrc = img ? img.src : null;

                        if (imageSrc && imageSrc.includes('no_poster.jpg')) {
                            const dataSrc = img.getAttribute('data-src');
                            const dataSrcSet = img.getAttribute('data-srcset');
                            
                            if (dataSrc && !dataSrc.includes('no_poster.jpg')) {
                                imageSrc = dataSrc;
                            } else if (dataSrcSet && !dataSrcSet.includes('no_poster.jpg')) {
                                imageSrc = dataSrcSet.split(',')[0].trim().split(' ')[0];
                            }
                        }

                        if (imageSrc && imageSrc.startsWith('/')) {
                            imageSrc = 'https://w1.123animes.ru' + imageSrc;
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
                                const title = secondLink.getAttribute('data-jititle') || secondLink.textContent.trim();
                                audioType = title.toLowerCase().includes('dub') ? 'DUB' : 'SUB';
                            }
                        }

                        return {
                            title: secondLink.getAttribute('data-jititle') || secondLink.textContent.trim(),
                            redirectlink: secondLink.href,
                            image: imageSrc,
                            total_episodes: episodes,
                            audioType: audioType
                        };
                    }
                    return null;
                })
                .filter(Boolean);
        });

        await mainPage.close();
        console.log(`📋 Found ${animeList.length} anime on page ${pageNum}`);

        const maxConcurrency = 10; 
        const pagePool = [];
        
        for (let i = 0; i < maxConcurrency; i++) {
            const page = await browser.newPage();
            
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            pagePool.push(page);
        }

        const getAnimeDetailsFast = async (animeUrl, page) => {
            try {
                await page.goto(animeUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 5000 
                });
                
                try {
                    await page.waitForSelector('.anxmnx', { timeout: 3000 });
                } catch (e) {
                    console.log(`⚠️ .anxmnx not found for ${animeUrl}, trying alternatives`);
                }
                
                return await page.evaluate(() => {
                    let anxmnxDiv = document.querySelector('.anxmnx');
                    
                    if (!anxmnxDiv) {
                        anxmnxDiv = document.querySelector('.info') || 
                                   document.querySelector('.anime-info') ||
                                   document.querySelector('.details');
                    }
                    
                    if (!anxmnxDiv) {
                        console.log('No info div found');
                        return { type: 'Unknown', genre: ['Unknown'] };
                    }
                    
                    let type = null;
                    let genre = [];
                    
                    const dtElements = anxmnxDiv.querySelectorAll('dt');
                    
                    if (dtElements.length > 0) {
                        dtElements.forEach(dt => {
                            const text = dt.textContent.trim().toLowerCase();
                            const nextDD = dt.nextElementSibling;
                            
                            if (text.includes('type:') && nextDD) {
                                const typeLink = nextDD.querySelector('a');
                                type = typeLink ? typeLink.textContent.trim() : nextDD.textContent.trim();
                            }
                            
                            if (text.includes('genre:') && nextDD) {
                                const genreLinks = nextDD.querySelectorAll('a');
                                if (genreLinks.length > 0) {
                                    genre = Array.from(genreLinks).map(link => link.textContent.trim());
                                } else {
                                    const genreText = nextDD.textContent.trim();
                                    if (genreText && genreText !== '') {
                                        genre = genreText.split(',').map(g => g.trim()).filter(g => g !== '');
                                    }
                                }
                            }
                        });
                    } else {
                        const infoText = anxmnxDiv.textContent;
                        const typeMatch = infoText.match(/Type:\s*([^,\n]+)/i);
                        if (typeMatch) {
                            type = typeMatch[1].trim();
                        }
                        
                        const genreMatch = infoText.match(/Genre:\s*([^,\n]+)/i);
                        if (genreMatch) {
                            genre = genreMatch[1].split(',').map(g => g.trim()).filter(g => g !== '');
                        }
                    }
            
                    if (!type) type = 'Unknown';
                    if (genre.length === 0) genre = ['Unknown'];
                    
                    return { type, genre };
                });
            } catch (error) {
                console.log(`❌ Error fetching details for ${animeUrl}: ${error.message}`);
                return { type: 'Unknown', genre: ['Unknown'] };
            }
        };

        const detailedAnimeList = [];
        const chunkSize = maxConcurrency;
        
        for (let i = 0; i < animeList.length; i += chunkSize) {
            const chunk = animeList.slice(i, i + chunkSize);
            
            const chunkPromises = chunk.map(async (anime, index) => {
                const page = pagePool[index % pagePool.length];
                const details = await getAnimeDetailsFast(anime.redirectlink, page);
                
                return {
                    title: anime.title,
                    redirectlink: anime.redirectlink,
                    details: {
                        type: details.type,
                        genre: details.genre
                    },
                    image: anime.image,
                    total_episodes: anime.total_episodes,
                    type: anime.audioType
                };
            });
            
            const chunkResults = await Promise.all(chunkPromises);
            detailedAnimeList.push(...chunkResults);
            
            console.log(`⚡ Processed ${detailedAnimeList.length}/${animeList.length} anime`);
        }

        // Close page pool
        await Promise.all(pagePool.map(page => page.close()));

        console.log(`🚀 Page ${pageNum}: Fetched ${detailedAnimeList.length} anime with improved error handling!`);
        return detailedAnimeList;

    } catch (error) {
        console.error('Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};