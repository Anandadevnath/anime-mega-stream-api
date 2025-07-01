import puppeteer from 'puppeteer';

export const test = async (maxEpisodes = 5) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        // First, get the ranges from the main page
        await page.goto('https://w1.123animes.ru/anime/one-piece-dub');
        await page.waitForSelector('.range', { timeout: 10000 });
        
        // Extract all ranges
        const ranges = await page.evaluate(() => {
            const rangeSpans = document.querySelectorAll('.range span[data-range-id]');
            const rangesData = [];
            
            rangeSpans.forEach(span => {
                const rangeId = span.getAttribute('data-range-id');
                const rangeText = span.textContent.trim();
                const className = span.className;
                
                rangesData.push({
                    id: rangeId,
                    text: rangeText,
                    class: className,
                    isActive: className.includes('active')
                });
            });
            
            return rangesData;
        });
        
        console.log('Found episode ranges:');
        ranges.forEach(range => {
            const status = range.isActive ? '(ACTIVE)' : '';
            console.log(`Range ${range.id}: ${range.text} ${status}`);
        });
        
        // Find the active range or use the first range
        const activeRange = ranges.find(range => range.isActive) || ranges[0];
        
        if (!activeRange) {
            console.log('No ranges found');
            return null;
        }
        
        console.log(`\nUsing range: ${activeRange.text}`);
        
        // Parse the range to get start and end episode numbers
        const rangeMatch = activeRange.text.match(/(\d+)\s*-\s*(\d+)/);
        if (!rangeMatch) {
            console.log('Could not parse range format');
            return null;
        }
        
        const startEpisode = parseInt(rangeMatch[1]);
        const endEpisode = parseInt(rangeMatch[2]);
        const episodesToProcess = Math.min(maxEpisodes, endEpisode - startEpisode + 1);
        
        console.log(`\nProcessing ${episodesToProcess} episodes from ${startEpisode} to ${startEpisode + episodesToProcess - 1}`);
        
        const episodeData = [];
        
        // Loop through episodes in the range
        for (let i = 0; i < episodesToProcess; i++) {
            const episodeNum = startEpisode + i;
            const episodeUrl = `https://w1.123animes.ru/anime/one-piece-dub/episode/${episodeNum}`;
            
            console.log(`\nProcessing Episode ${episodeNum}...`);
            
            try {
                // Navigate to episode page
                await page.goto(episodeUrl);
                
                // Wait for iframe to load
                await page.waitForSelector('iframe', { timeout: 10000 });
                
                // Extract iframe src
                const iframeSrc = await page.evaluate(() => {
                    const iframe = document.querySelector('#iframe_ext82377 iframe') || 
                                  document.querySelector('iframe');
                    return iframe ? iframe.src : null;
                });
                
                if (iframeSrc) {
                    console.log(`Episode ${episodeNum} iframe src:`, iframeSrc);
                    episodeData.push({
                        episode: episodeNum,
                        url: episodeUrl,
                        iframeSrc: iframeSrc
                    });
                } else {
                    console.log(`Episode ${episodeNum}: No iframe found`);
                    episodeData.push({
                        episode: episodeNum,
                        url: episodeUrl,
                        iframeSrc: null
                    });
                }
                
                // Small delay to avoid overwhelming the server
                await page.waitForTimeout(1000);
                
            } catch (error) {
                console.log(`Error processing episode ${episodeNum}:`, error.message);
                episodeData.push({
                    episode: episodeNum,
                    url: episodeUrl,
                    iframeSrc: null,
                    error: error.message
                });
            }
        }
        
        // Display summary
        console.log('\n=== SUMMARY ===');
        episodeData.forEach(ep => {
            if (ep.iframeSrc) {
                console.log(`Episode ${ep.episode}: ${ep.iframeSrc}`);
            } else {
                console.log(`Episode ${ep.episode}: No iframe found`);
            }
        });
        
        return {
            ranges: ranges,
            activeRange: activeRange,
            episodeData: episodeData
        };
        
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    } finally {
        await browser.close();
    }
};