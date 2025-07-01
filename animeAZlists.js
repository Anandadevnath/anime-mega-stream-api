import puppeteer from 'puppeteer';

export const AnimeAZ = async (pageNum = 1) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://w1.123animes.ru/az-all-anime/all');
        await page.waitForSelector('.film-list', { timeout: 10000 });
       
        const Animelist = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.film-list .item .inner'))
                .map(inner => {
                    const links = inner.querySelectorAll('a[href]');
                    if (links.length >= 2) {
                        const secondLink = links[1]; // Get the 2nd <a> tag
                        return {
                            title: secondLink.getAttribute('data-jititle') || secondLink.textContent.trim(),
                            link: secondLink.href
                        };
                    }
                    return null;
                })
                .filter(item => item !== null);
        });
        
        // console.log(`Found ${Animelist.length} anime links:`);
        // Animelist.forEach((anime, index) => {
        //     console.log(`${index + 1}. ${anime.title} - ${anime.link}`);
        // });
        
        return Animelist;
        
    } catch (error) {
        console.error('Error:', error.message);
        return [];
    } finally {
        await browser.close();
    }
};