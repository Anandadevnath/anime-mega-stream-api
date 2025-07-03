import express from 'express';
import { scrapeFilmList } from './scrapeFilmList.js';
import { scrapeAnimeDetails } from './scrapeAnimeDetails.js';
import { scrapeSingleEpisode } from './scrapeSingleEpisode.js';

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

// http://localhost:5000/anime-details?url=https://w1.123animes.ru/anime/your-forma
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

// http://localhost:5000/episode-stream?url=https://w1.123animes.ru/anime/sentai-daishikkaku-2nd-season-dub/episode/1
app.get('/episode-stream', async (req, res) => {
    try {
        const episodeUrl = req.query.url;
        
        if (!episodeUrl) {
            return res.status(400).json({ 
                error: 'URL parameter is required',
                example: 'http://localhost:5000/episode-stream?url=https://w1.123animes.ru/anime/anime-name/episode/1'
            });
        }
        
        if (!episodeUrl.includes('w1.123animes.ru/anime/') || !episodeUrl.includes('episode')) {
            return res.status(400).json({ 
                error: 'Invalid episode URL format',
                expected: 'https://w1.123animes.ru/anime/anime-name/episode/1'
            });
        }
        
        console.log(`🎯 Fetching streaming link for episode: ${episodeUrl}`);
        
        const startTime = Date.now();
        const result = await scrapeSingleEpisode(episodeUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        if (result.success) {
            console.log(`✅ Found streaming link in ${duration.toFixed(2)} seconds`);
            res.json({
                success: true,
                data: result.data,
                extraction_time_seconds: duration
            });
        } else {
            console.log(`❌ Failed to find streaming link: ${result.error}`);
            res.status(404).json({
                success: false,
                error: result.error,
                episode_url: episodeUrl,
                extraction_time_seconds: duration
            });
        }
        
    } catch (error) {
        console.error('❌ Error fetching episode stream:', error.message);
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