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

        const maxConcurrency = 4; // Reduced for iframe processing
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

        // Function to extract iframe src - EXACT SAME AS YOUR WORKING CODE
        const getEpisodeIframeSrc = async (episodeUrl, page) => {
            try {
                await page.goto(episodeUrl);
                
                // Wait for iframe to load - EXACT SAME AS YOUR CODE
                await page.waitForSelector('iframe', { timeout: 10000 });
                
                // Extract iframe src - EXACT SAME AS YOUR CODE
                const iframeSrc = await page.evaluate(() => {
                    const iframe = document.querySelector('#iframe_ext82377 iframe');
                    return iframe ? iframe.src : null;
                });
                
                console.log(`🎬 Iframe src for ${episodeUrl}:`, iframeSrc);
                return iframeSrc;
                
            } catch (error) {
                console.log(`❌ Error extracting iframe from ${episodeUrl}: ${error.message}`);
                return null;
            }
        };

        const getAnimeDetailsFast = async (animeUrl, page) => {
            try {
                await page.goto(animeUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 10000 
                });
                
                // Wait for info section
                try {
                    await page.waitForSelector('.anxmnx', { timeout: 4000 });
                } catch (e) {
                    console.log(`⚠️ .anxmnx not found for ${animeUrl}`);
                }
                
                // Wait for episode containers
                try {
                    await page.waitForSelector('.episodes', { timeout: 3000 });
                } catch (e) {
                    console.log(`⚠️ Episode container not found for ${animeUrl}`);
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
                        return { type: 'Unknown', genre: ['Unknown'], episode_links: [] };
                    }
                    
                    let type = null;
                    let genre = [];
                    let episode_links = [];
                    
                    // Extract type and genre
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
                    }

                    // Extract ALL episode ranges and their episodes
                    const allEpisodeRanges = document.querySelectorAll('.episodes.range');
                    
                    if (allEpisodeRanges.length > 0) {
                        console.log(`Found ${allEpisodeRanges.length} episode ranges`);
                        
                        allEpisodeRanges.forEach((rangeContainer, rangeIndex) => {
                            const rangeId = rangeContainer.getAttribute('data-range-id');
                            const rangeStyle = rangeContainer.getAttribute('style');
                            const isVisible = !rangeStyle || !rangeStyle.includes('display:none');
                            
                            console.log(`Range ${rangeIndex + 1}: ID=${rangeId}, Visible=${isVisible}`);
                            
                            // Get all episode links in this range
                            const episodeLinks = rangeContainer.querySelectorAll('li a[href]');
                            
                            episodeLinks.forEach(link => {
                                const episodeNumber = link.textContent.trim();
                                const episodeUrl = link.href;
                                
                                // Only add if it's a valid episode
                                if (episodeUrl.includes('episode') || /^\d+(\.\d+)?$/.test(episodeNumber)) {
                                    episode_links.push({
                                        episode_number: episodeNumber,
                                        episode_url: episodeUrl,
                                        range_id: rangeId,
                                        range_index: rangeIndex + 1
                                    });
                                }
                            });
                        });
                    } else {
                        // Fallback for single episode container
                        const singleEpisodeContainer = document.querySelector('.episodes');
                        if (singleEpisodeContainer) {
                            const episodeLinks = singleEpisodeContainer.querySelectorAll('li a[href]');
                            
                            episodeLinks.forEach(link => {
                                const episodeNumber = link.textContent.trim();
                                const episodeUrl = link.href;
                                
                                if (episodeUrl.includes('episode') || /^\d+(\.\d+)?$/.test(episodeNumber)) {
                                    episode_links.push({
                                        episode_number: episodeNumber,
                                        episode_url: episodeUrl,
                                        range_id: '0',
                                        range_index: 1
                                    });
                                }
                            });
                        }
                    }
                    
                    // Sort episodes by number
                    episode_links.sort((a, b) => {
                        const numA = parseFloat(a.episode_number) || 0;
                        const numB = parseFloat(b.episode_number) || 0;
                        return numA - numB;
                    });
                    
                    if (!type) type = 'Unknown';
                    if (genre.length === 0) genre = ['Unknown'];
                    
                    console.log(`Total episodes extracted: ${episode_links.length}`);
                    return { type, genre, episode_links };
                });
            } catch (error) {
                console.log(`❌ Error fetching details for ${animeUrl}: ${error.message}`);
                return { type: 'Unknown', genre: ['Unknown'], episode_links: [] };
            }
        };

        const detailedAnimeList = [];
        const chunkSize = maxConcurrency;
        
        for (let i = 0; i < animeList.length; i += chunkSize) {
            const chunk = animeList.slice(i, i + chunkSize);
            
            const chunkPromises = chunk.map(async (anime, index) => {
                const page = pagePool[index % pagePool.length];
                const details = await getAnimeDetailsFast(anime.redirectlink, page);
                
                // Process first 2 episodes to get iframe sources (reduced to avoid timeout)
                const episodesWithIframes = await Promise.all(
                    details.episode_links.slice(0, 2).map(async (episode) => {
                        console.log(`🎬 Getting iframe for ${anime.title} - Episode ${episode.episode_number}`);
                        const iframeSrc = await getEpisodeIframeSrc(episode.episode_url, page);
                        
                        return {
                            ...episode,
                            iframe_src: iframeSrc
                        };
                    })
                );
                
                // Add remaining episodes without iframe extraction
                const remainingEpisodes = details.episode_links.slice(2).map(episode => ({
                    ...episode,
                    iframe_src: null
                }));
                
                return {
                    title: anime.title,
                    redirectlink: anime.redirectlink,
                    details: {
                        type: details.type,
                        genre: details.genre,
                        episode_links: [...episodesWithIframes, ...remainingEpisodes]
                    },
                    image: anime.image,
                    total_episodes: anime.total_episodes,
                    type: anime.audioType
                };
            });
            
            const chunkResults = await Promise.all(chunkPromises);
            detailedAnimeList.push(...chunkResults);
            
            const episodeCount = chunkResults.reduce((total, anime) => total + anime.details.episode_links.length, 0);
            const iframeCount = chunkResults.reduce((total, anime) => 
                total + anime.details.episode_links.filter(ep => ep.iframe_src).length, 0);
            console.log(`⚡ Processed ${detailedAnimeList.length}/${animeList.length} anime (${episodeCount} episodes, ${iframeCount} with iframes)`);
        }

        // Close page pool
        await Promise.all(pagePool.map(page => page.close()));

        const totalEpisodes = detailedAnimeList.reduce((total, anime) => total + anime.details.episode_links.length, 0);
        const totalIframes = detailedAnimeList.reduce((total, anime) => 
            total + anime.details.episode_links.filter(ep => ep.iframe_src).length, 0);
        console.log(`🚀 Page ${pageNum}: Fetched ${detailedAnimeList.length} anime with ${totalEpisodes} episodes (${totalIframes} with iframe sources)!`);
        return detailedAnimeList;

    } catch (error) {
        console.error('Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};