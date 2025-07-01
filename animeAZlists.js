import puppeteer from 'puppeteer';

export const AnimeAZ = async (pageNum = 1) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        const url = `https://w1.123animes.ru/az-all-anime/all/?page=${pageNum}`;
        await page.goto(url);
        await page.waitForSelector('.film-list', { timeout: 10000 });
       
        const Animelist = await page.evaluate(() => {
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
                            } else {
                                imageSrc = null; 
                            }
                        }
                        
                        if (imageSrc && imageSrc.startsWith('/')) {
                            imageSrc = 'https://w1.123animes.ru' + imageSrc;
                        }
                        
                        const statusDiv = firstLink.querySelector('.status');
                        let episodes = null;
                        let type = null;
                        
                        if (statusDiv) {
                            const epDiv = statusDiv.querySelector('.ep');
                            const subSpan = statusDiv.querySelector('.sub');
                            
                            if (epDiv) {
                                episodes = epDiv.textContent.trim();
                            }
                            
                            if (subSpan) {
                                type = subSpan.textContent.trim();
                            } else {
                                const title = secondLink.getAttribute('data-jititle') || secondLink.textContent.trim();
                                if (title.toLowerCase().includes('dub')) {
                                    type = 'DUB';
                                } else {
                                    type = 'SUB'; 
                                }
                            }
                        }
                        
                        return {
                            title: secondLink.getAttribute('data-jititle') || secondLink.textContent.trim(),
                            link: secondLink.href,
                            image: imageSrc,
                            episodes: episodes,
                            type: type
                        };
                    }
                    return null;
                })
                .filter(item => item !== null);
        });

        console.log(`📺 Page ${pageNum}: Fetched ${Animelist.length} anime titles`);
        
        return Animelist;
        
    } catch (error) {
        console.error('Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};