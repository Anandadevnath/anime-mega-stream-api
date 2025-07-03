import express from 'express';
import { scrapeFilmList, scrapeAnimeDetails } from './filmListScraper.js';

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// http://localhost:5000/anime-list?page=1
app.get('/anime-list', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const baseUrl = `https://w1.123animes.ru/az-all-anime/all/?page=${page}`;
        
        console.log(`🚀 Fetching anime list from page ${page}`);
        console.log(`🔗 URL: ${baseUrl}`);
        
        const startTime = Date.now();
        const animeList = await scrapeFilmList(baseUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched ${animeList.length} anime in ${duration.toFixed(2)} seconds`);
        
        res.json(animeList);
        
    } catch (error) {
        console.error('❌ Error fetching anime list:', error.message);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/anime-details?url=https://w1.123animes.ru/anime/kanpekisugite-kawaige-ga-nai-to-konyaku-haki-sareta-seijo-wa-ringoku-ni-urareru
app.get('/anime-details', async (req, res) => {
    try {
        const animeUrl = req.query.url;
        
        if (!animeUrl) {
            return res.status(400).json({ 
                error: 'URL parameter is required',
                example: 'http://localhost:5000/anime-details?url=https://w1.123animes.ru/anime/anime-name'
            });
        }
        
        if (!animeUrl.includes('w1.123animes.ru/anime/')) {
            return res.status(400).json({ 
                error: 'Invalid anime URL format',
                expected: 'https://w1.123animes.ru/anime/anime-name'
            });
        }
        
        console.log(`🎬 Fetching anime details from: ${animeUrl}`);
        
        const startTime = Date.now();
        const streamingLinks = await scrapeAnimeDetails(animeUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched anime details in ${duration.toFixed(2)} seconds`);
        console.log(`📊 Found ${streamingLinks.length} streaming links`);
        
        res.json(streamingLinks);
        
    } catch (error) {
        console.error('❌ Error fetching anime details:', error.message);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Anime Scraper API running at http://localhost:${PORT}`);;
});