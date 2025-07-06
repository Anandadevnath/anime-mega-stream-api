import express from 'express';
import dotenv from 'dotenv';
import connectDB from './database/config.js';
import { scrapeFilmList } from './scrapeFilmList.js';
import { scrapeAnimeDetails } from './scrapeAnimeDetails.js';
import { scrapeSingleEpisode } from './scrapeSingleEpisode.js';
import { scrapeHiAnimeTop10 } from './scrapeHiAnimeTop10.js';
import { scrapeHiAnimeWeeklyTop10 } from './scrapeHiAnimeWeeklyTop10.js';
import { scrapeHiAnimeMonthlyTop10 } from './scrapeHiAnimeMonthlyTop10.js';
import { 
    saveBulkAnime, 
} from './database/services/animeService.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// root endpoint with complete API documentation
app.get('/', async (req, res) => {
    res.json({
        message: "🎬 Anime Scraper API is running!",
        version: "2.1.0",
    });
});

// http://localhost:5000/hianime-top10
app.get('/hianime-top10', async (req, res) => {
    try {
        console.log('🔥 Fetching HiAnime top 10 trending anime...');
        
        const startTime = Date.now();
        const top10Anime = await scrapeHiAnimeTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched ${top10Anime.length} trending anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: true,
            source: "HiAnime.to",
            total_anime: top10Anime.length,
            extraction_time_seconds: duration,
            data: top10Anime
        });
        
    } catch (error) {
        console.error('❌ Error fetching HiAnime top 10:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/hianime-weekly-top10
app.get('/hianime-weekly-top10', async (req, res) => {
    try {
        console.log('📅 Fetching HiAnime weekly top 10 anime...');
        
        const startTime = Date.now();
        const weeklyTop10Anime = await scrapeHiAnimeWeeklyTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched ${weeklyTop10Anime.length} weekly anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: true,
            source: "HiAnime.to",
            type: "weekly",
            total_anime: weeklyTop10Anime.length,
            extraction_time_seconds: duration,
            data: weeklyTop10Anime
        });
        
    } catch (error) {
        console.error('❌ Error fetching HiAnime weekly top 10:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/hianime-monthly-top10
app.get('/hianime-monthly-top10', async (req, res) => {
    try {
        console.log('📅 Fetching HiAnime monthly top 10 anime...');
        
        const startTime = Date.now();
        const monthlyTop10Anime = await scrapeHiAnimeMonthlyTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched ${monthlyTop10Anime.length} monthly anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: true,
            source: "HiAnime.to",
            type: "monthly",
            total_anime: monthlyTop10Anime.length,
            extraction_time_seconds: duration,
            data: monthlyTop10Anime
        });
        
    } catch (error) {
        console.error('❌ Error fetching HiAnime monthly top 10:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
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
        
        // Save to MongoDB
        try {
            const animeData = animeList.map(anime => ({
                ...anime,
                category: 'general',
                source: '123animes.ru',
                ranking: null
            }));
            await saveBulkAnime(animeData);
            console.log('💾 Successfully saved anime list to database');
        } catch (dbError) {
            console.error('❌ Error saving anime list to database:', dbError.message);
        }
        
        res.json(animeList);
        
    } catch (error) {
        console.error('❌ Error fetching anime list:', error.message);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/anime-details?id=your-forma
app.get('/anime-details', async (req, res) => {
    try {
        const animeId = req.query.id;
        
        if (!animeId) {
            return res.status(400).json({ 
                error: 'ID parameter is required',
                example: 'http://localhost:5000/anime-details?id=your-forma'
            });
        }
        
        if (!/^[a-z0-9-]+$/.test(animeId)) {
            return res.status(400).json({ 
                error: 'Invalid anime ID format. Use lowercase letters, numbers, and hyphens only.',
                example: 'http://localhost:5000/anime-details?id=your-forma'
            });
        }
        
        const animeUrl = `https://w1.123animes.ru/anime/${animeId}`;
        
        console.log(`🎬 Fetching anime details for: ${animeId}`);
        
        const startTime = Date.now();
        const streamingLinks = await scrapeAnimeDetails(animeUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Fetched anime details in ${duration.toFixed(2)} seconds`);
        console.log(`📊 Found ${streamingLinks.length} streaming links`);
        
        res.json({
            success: true,
            anime_id: animeId,
            episodes: streamingLinks,
            total_episodes: streamingLinks.length,
            extraction_time_seconds: duration
        });
        
    } catch (error) {
        console.error('❌ Error fetching anime details:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/episode-stream?id=sentai-daishikkaku-2nd-season-dub&ep=1
app.get('/episode-stream', async (req, res) => {
    try {
        const animeId = req.query.id;
        const episodeNumber = req.query.ep;
        
        if (!animeId || !episodeNumber) {
            return res.status(400).json({ 
                error: 'Both id and ep parameters are required',
                example: 'http://localhost:5000/episode-stream?id=sentai-daishikkaku-2nd-season-dub&ep=1'
            });
        }
        
        // Validate episode number is numeric
        if (isNaN(episodeNumber) || episodeNumber < 1) {
            return res.status(400).json({ 
                error: 'Episode number must be a positive integer',
                example: 'http://localhost:5000/episode-stream?id=anime-name&ep=1'
            });
        }
        
        const episodeUrl = `https://w1.123animes.ru/anime/${animeId}/episode/${episodeNumber}`;
        
        console.log(`🎯 Fetching streaming link for: ${animeId} Episode ${episodeNumber}`);
        
        const startTime = Date.now();
        const result = await scrapeSingleEpisode(episodeUrl);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        if (result.success) {
            console.log(`✅ Found streaming link in ${duration.toFixed(2)} seconds`);
            res.json({
                success: true,
                anime_id: animeId,
                episode: episodeNumber,
                data: result.data,
                extraction_time_seconds: duration
            });
        } else {
            console.log(`❌ Failed to find streaming link: ${result.error}`);
            res.status(404).json({
                success: false,
                error: result.error,
                anime_id: animeId,
                episode: episodeNumber,
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
    console.log(`🚀 Anime Scraper API v2.1 running at http://localhost:${PORT}`);
});