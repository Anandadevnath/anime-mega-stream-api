import express from 'express';
import { AnimeAZ } from './animeAZlists.js';
import { Aniscrape } from './anime.js';
import { test } from './test.js';
import { scrapeFilmList } from './filmListScraper.js';

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// http://localhost:5000/scrape-film-list?url=https://w1.123animes.ru/az-all-anime/all/&page=1
app.get('/scrape-film-list', async (req, res) => {
    try {
        const baseUrl = req.query.url || 'https://w1.123animes.ru/az-all-anime/all/';
        const page = req.query.page ? `?page=${req.query.page}` : '';
        const fullUrl = baseUrl + page;
        
        console.log(`🚀 Scraping film list with Playwright from: ${fullUrl}`);
        console.log(`⚡ Using optimized resource blocking for faster scraping...`);
        console.log(`🎯 Target: 5 anime with ALL episodes each`);

        const startTime = Date.now();
        const results = await scrapeFilmList(fullUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`✅ Scraping completed in ${duration.toFixed(2)} seconds`);
        console.log(`📊 Found ${results.length} total streaming links`);

        // Return only the data array directly
        res.json(results);

    } catch (error) {
        console.error('❌ Playwright Scraping Error:', error.message);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Anime Scraper API running at http://localhost:${PORT}`)

});