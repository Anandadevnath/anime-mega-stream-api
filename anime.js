import puppeteer from 'puppeteer';

export const Aniscrape = async (pageNum = 1) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://w1.123animes.ru/anime/one-piece-dub/episode/8');
       
        // Wait for iframe to load
        await page.waitForSelector('iframe', { timeout: 10000 });
        
        // Extract iframe src
        const iframeSrc = await page.evaluate(() => {
            const iframe = document.querySelector('#iframe_ext82377 iframe');
            return iframe ? iframe.src : null;
        });
        
        console.log('Iframe src:', iframeSrc);
        return iframeSrc;
        
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    } finally {
        await browser.close();
    }
};