import puppeteer from 'puppeteer';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const test = async (maxEpisodes = null) => { 
    const browser = await puppeteer.launch({ headless: true }); 
    const page = await browser.newPage();
    
    try {
        // Navigate to the main anime page
        console.log('🌐 Loading main anime page...');
        await page.goto('https://w1.123animes.ru/anime/uchuujin-muumuu');
        await delay(3000);
        
        // Extract all ranges first
        let ranges = [];
        try {
            await page.waitForSelector('.range', { timeout: 5000 });
            ranges = await page.evaluate(() => {
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
            
            console.log('📊 Found episode ranges:');
            ranges.forEach(range => {
                const status = range.isActive ? '(ACTIVE)' : '';
                console.log(`Range ${range.id}: ${range.text} ${status}`);
            });
        } catch (e) {
            console.log('⚠️ No ranges found');
        }
        
        // Extract ALL episode links from the page
        console.log('\n🔍 Extracting episode links...');
        const allEpisodeLinks = await page.evaluate(() => {
            const episodeLinks = [];
            
            // Look for all episode ranges (visible and hidden)
            const allRanges = document.querySelectorAll('.episodes.range');
            console.log(`Found ${allRanges.length} episode ranges`);
            
            allRanges.forEach((rangeContainer, rangeIndex) => {
                const rangeId = rangeContainer.getAttribute('data-range-id');
                const rangeStyle = rangeContainer.getAttribute('style');
                const isVisible = !rangeStyle || !rangeStyle.includes('display:none');
                
                console.log(`Processing range ${rangeIndex + 1}: ID=${rangeId}, Visible=${isVisible}`);
                
                // Get all episode links in this range
                const episodeAnchors = rangeContainer.querySelectorAll('li a[href]');
                
                episodeAnchors.forEach(anchor => {
                    const episodeNumber = anchor.textContent.trim();
                    const episodeUrl = anchor.href;
                    const dataId = anchor.getAttribute('data-id');
                    
                    // Only add if it's a valid episode URL
                    if (episodeUrl && episodeUrl.includes('episode')) {
                        episodeLinks.push({
                            episode_number: episodeNumber,
                            episode_url: episodeUrl,
                            data_id: dataId,
                            range_id: rangeId,
                            range_index: rangeIndex + 1,
                            is_visible: isVisible
                        });
                    }
                });
            });
            
            // If no ranges found, try fallback selector
            if (episodeLinks.length === 0) {
                console.log('No ranges found, trying fallback selectors...');
                const fallbackLinks = document.querySelectorAll('.episodes a[href*="episode"], a[href*="episode"]');
                
                fallbackLinks.forEach((anchor, index) => {
                    const episodeNumber = anchor.textContent.trim() || (index + 1).toString();
                    const episodeUrl = anchor.href;
                    
                    episodeLinks.push({
                        episode_number: episodeNumber,
                        episode_url: episodeUrl,
                        data_id: anchor.getAttribute('data-id'),
                        range_id: '0',
                        range_index: 1,
                        is_visible: true
                    });
                });
            }
            
            // Sort episodes by number
            return episodeLinks.sort((a, b) => {
                const numA = parseFloat(a.episode_number) || 0;
                const numB = parseFloat(b.episode_number) || 0;
                return numA - numB;
            });
        });
        
        console.log(`✅ Found ${allEpisodeLinks.length} total episodes`);
        
        
        if (allEpisodeLinks.length === 0) {
            console.log('❌ No episodes found');
            return null;
        }
        
        // Process ALL episodes or limit if specified
        const episodesToProcess = maxEpisodes ? allEpisodeLinks.slice(0, maxEpisodes) : allEpisodeLinks;
        console.log(`\n🎬 Processing ${episodesToProcess.length} episodes for iframe extraction...`);
        
        const episodeData = [];
        
        // Process each episode to get iframe source
        for (let i = 0; i < episodesToProcess.length; i++) {
            const episode = episodesToProcess[i];
            console.log(`\n[${i + 1}/${episodesToProcess.length}] 🔍 Processing Episode ${episode.episode_number}...`);
            
            try {
                // Navigate to episode page
                await page.goto(episode.episode_url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000 
                });
                
                // Wait for page to load
                await delay(2000);
                
                // Try to find iframe with multiple strategies
                let iframeSrc = null;
                
                // Strategy 1: Wait for specific iframe container
                try {
                    await page.waitForSelector('#iframe_ext82377', { timeout: 8000 });
                    
                    iframeSrc = await page.evaluate(() => {
                        const iframe = document.querySelector('#iframe_ext82377 iframe');
                        return iframe ? iframe.src : null;
                    });
                    
                    if (iframeSrc) {
                        console.log(`✅ Found iframe (Strategy 1): ${iframeSrc.substring(0, 80)}...`);
                    }
                } catch (e) {
                    console.log(`⚠️ Strategy 1 failed for episode ${episode.episode_number}`);
                }
                
                // Strategy 2: Look for any valid iframe
                if (!iframeSrc) {
                    try {
                        await page.waitForSelector('iframe', { timeout: 5000 });
                        
                        iframeSrc = await page.evaluate(() => {
                            const iframes = document.querySelectorAll('iframe');
                            
                            for (let iframe of iframes) {
                                if (iframe.src && 
                                    iframe.src.length > 10 &&
                                    !iframe.src.includes('recaptcha') &&
                                    !iframe.src.includes('google.com') &&
                                    !iframe.src.includes('ads') &&
                                    iframe.src !== 'about:blank') {
                                    return iframe.src;
                                }
                            }
                            return null;
                        });
                        
                        if (iframeSrc) {
                            console.log(`✅ Found iframe (Strategy 2): ${iframeSrc.substring(0, 80)}...`);
                        }
                    } catch (e) {
                        console.log(`⚠️ Strategy 2 failed for episode ${episode.episode_number}`);
                    }
                }
                
                // Strategy 3: Wait longer and try again
                if (!iframeSrc) {
                    console.log(`🔄 Trying longer wait for episode ${episode.episode_number}...`);
                    await delay(3000);
                    
                    iframeSrc = await page.evaluate(() => {
                        const iframe = document.querySelector('#iframe_ext82377 iframe') ||
                                     document.querySelector('iframe[src*="embed"]') ||
                                     document.querySelector('iframe[src*="play"]') ||
                                     document.querySelector('iframe[src*="stream"]');
                        return iframe ? iframe.src : null;
                    });
                    
                    if (iframeSrc) {
                        console.log(`✅ Found iframe (Strategy 3): ${iframeSrc.substring(0, 80)}...`);
                    }
                }
                
                // Store episode data
                episodeData.push({
                    episode_number: episode.episode_number,
                    episode_url: episode.episode_url,
                    iframe_src: iframeSrc,
                    range_id: episode.range_id,
                    range_index: episode.range_index,
                    data_id: episode.data_id,
                    success: !!iframeSrc
                });
                
                if (!iframeSrc) {
                    console.log(`❌ No iframe found for episode ${episode.episode_number}`);
                }
                
                // Add progress indicator every 10 episodes
                if ((i + 1) % 10 === 0) {
                    const successCount = episodeData.filter(ep => ep.success).length;
                    console.log(`📊 Progress: ${i + 1}/${episodesToProcess.length} episodes processed (${successCount} successful)`);
                }
                
                // Delay between requests to avoid rate limiting
                if (i < episodesToProcess.length - 1) {
                    await delay(1500);
                }
                
            } catch (error) {
                console.log(`❌ Error processing episode ${episode.episode_number}:`, error.message);
                episodeData.push({
                    episode_number: episode.episode_number,
                    episode_url: episode.episode_url,
                    iframe_src: null,
                    range_id: episode.range_id,
                    range_index: episode.range_index,
                    data_id: episode.data_id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Display summary
        console.log('\n' + '='.repeat(50));
        console.log('📋 FINAL SUMMARY');
        console.log('='.repeat(50));
        
        const successfulEpisodes = episodeData.filter(ep => ep.success);
        const failedEpisodes = episodeData.filter(ep => !ep.success);
        
        console.log(`✅ Successful: ${successfulEpisodes.length}/${episodeData.length} episodes`);
        console.log(`❌ Failed: ${failedEpisodes.length}/${episodeData.length} episodes`);
        console.log(`📈 Success Rate: ${Math.round((successfulEpisodes.length / episodeData.length) * 100)}%`);
        
        // 🔥 DISPLAY ALL SUCCESSFUL EPISODES - NO LIMITS!
        console.log('\n📺 ALL SUCCESSFUL EPISODES WITH IFRAME SOURCES:');
        console.log('=' + '='.repeat(80));
        successfulEpisodes.forEach((ep, index) => {
            console.log(`${index + 1}. Episode ${ep.episode_number}: ${ep.iframe_src}`);
        });
        
        // Display failed episodes if any
        if (failedEpisodes.length > 0) {
            console.log('\n❌ FAILED EPISODES:');
            console.log('=' + '='.repeat(50));
            failedEpisodes.forEach((ep, index) => {
                console.log(`${index + 1}. Episode ${ep.episode_number}: ${ep.error || 'No iframe found'}`);
            });
        }
        
        // Additional detailed breakdown
        console.log('\n📊 DETAILED BREAKDOWN:');
        console.log('=' + '='.repeat(50));
        episodeData.forEach((ep, index) => {
            const status = ep.success ? '✅' : '❌';
            const source = ep.iframe_src || 'No iframe found';
            console.log(`${index + 1}. ${status} Episode ${ep.episode_number}: ${source}`);
        });
        
        return {
            ranges: ranges,
            allEpisodeLinks: allEpisodeLinks,
            processedEpisodes: episodeData,
            summary: {
                total: episodeData.length,
                successful: successfulEpisodes.length,
                failed: failedEpisodes.length,
                success_rate: `${Math.round((successfulEpisodes.length / episodeData.length) * 100)}%`
            }
        };
        
    } catch (error) {
        console.error('❌ Main Error:', error.message);
        return null;
    } finally {
        await browser.close();
    }
};