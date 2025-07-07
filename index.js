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
    getAllAnime, 
    searchAnime, 
    getAnimeStats,
    getAnimeByCategory 
} from './database/services/animeService.js';
import { 
    getStreamingLinksByAnime, 
    getAllStreamingLinks, 
    getStreamingLinksStats 
} from './database/services/streamingLinkService.js';
import { 
    getSingleStreamingLinksByAnime, 
    getAllSingleStreamingLinks, 
    getSingleStreamingLinksStats 
} from './database/services/singleStreamingLinkService.js';

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
        endpoints: {
            scraping: {
                anime_list: "/anime-list?page=1",
                anime_details: "/anime-details?id=anime-name",
                episode_stream: "/episode-stream?id=anime-name&ep=1",
                hianime_top10: "/hianime-top10",
                hianime_weekly_top10: "/hianime-weekly-top10",
                hianime_monthly_top10: "/hianime-monthly-top10"
            },
            database: {
                anime: "/db/anime",
                search: "/db/search?q=naruto",
                trending: "/db/trending",
                weekly: "/db/weekly",
                monthly: "/db/monthly",
                stats: "/db/stats"
            },
            streaming_links: {
                all: "/db/streaming-links",
                by_anime: "/db/streaming-links/anime?title=Naruto",
                single_all: "/db/single-streaming-links",
                single_by_anime: "/db/single-streaming-links/anime?title=Naruto",
                stats: "/db/streaming-stats",
                single_stats: "/db/single-streaming-stats"
            }
        }
    });
});

// http://localhost:5000/hianime-top10
app.get('/hianime-top10', async (req, res) => {
    try {
        console.log('🔥 Fetching HiAnime top 10 trending anime...');
        
        const startTime = Date.now();
        const result = await scrapeHiAnimeTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Scraped ${result.data.length} trending anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: result.success,
            message: result.message,
            source: "HiAnime.to",
            scraping_stats: {
                total_anime: result.data.length,
                extraction_time_seconds: duration,
                scraped_at: new Date().toISOString()
            },
            data: result.data,
            database_save: result.database_save
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
        const result = await scrapeHiAnimeWeeklyTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Scraped ${result.data.length} weekly anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: result.success,
            message: result.message,
            source: "HiAnime.to",
            type: "weekly",
            scraping_stats: {
                total_anime: result.data.length,
                extraction_time_seconds: duration,
                scraped_at: new Date().toISOString()
            },
            data: result.data,
            database_save: result.database_save
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
        const result = await scrapeHiAnimeMonthlyTop10();
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Scraped ${result.data.length} monthly anime in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: result.success,
            message: result.message,
            source: "HiAnime.to",
            type: "monthly",
            scraping_stats: {
                total_anime: result.data.length,
                extraction_time_seconds: duration,
                scraped_at: new Date().toISOString()
            },
            data: result.data,
            database_save: result.database_save
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
        
        res.json({
            success: true,
            source: "123animes.ru",
            page: parseInt(page),
            scraping_stats: {
                total_anime: animeList.length,
                extraction_time_seconds: duration,
                scraped_at: new Date().toISOString()
            },
            data: animeList
        });
        
    } catch (error) {
        console.error('❌ Error fetching anime list:', error.message);
        res.status(500).json({ 
            success: false,
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

// 💾 DATABASE ENDPOINTS

// http://localhost:5000/db/anime
app.get('/db/anime', async (req, res) => {
    try {
        const { page = 1, limit = 20, category, source } = req.query;
        
        console.log(`🔍 Fetching anime from database - Page: ${page}, Limit: ${limit}`);
        
        const result = await getAllAnime(page, limit);
        
        res.json({
            success: true,
            data: result.anime,
            pagination: result.pagination,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching anime from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/search?q=naruto
app.get('/db/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q) {
            return res.status(400).json({ 
                success: false,
                error: 'Search query (q) parameter is required',
                example: '/db/search?q=naruto'
            });
        }
        
        console.log(`🔍 Searching anime in database for: "${q}"`);
        
        const result = await searchAnime(q, limit);
        
        res.json({
            success: true,
            search_query: q,
            data: result,
            total_results: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error searching anime in database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/trending
app.get('/db/trending', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        console.log(`🔥 Fetching trending anime from database`);
        
        const result = await getAnimeByCategory('trending', limit);
        
        res.json({
            success: true,
            category: 'trending',
            data: result,
            total_results: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching trending anime from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/weekly
app.get('/db/weekly', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        console.log(`📅 Fetching weekly anime from database`);
        
        const result = await getAnimeByCategory('weekly', limit);
        
        res.json({
            success: true,
            category: 'weekly',
            data: result,
            total_results: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching weekly anime from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/monthly
app.get('/db/monthly', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        console.log(`📅 Fetching monthly anime from database`);
        
        const result = await getAnimeByCategory('monthly', limit);
        
        res.json({
            success: true,
            category: 'monthly',
            data: result,
            total_results: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching monthly anime from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/stats
app.get('/db/stats', async (req, res) => {
    try {
        console.log(`📊 Fetching anime statistics from database`);
        
        const stats = await getAnimeStats();
        
        res.json({
            success: true,
            statistics: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching anime statistics:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🎬 STREAMING LINKS ENDPOINTS

// http://localhost:5000/db/streaming-links
app.get('/db/streaming-links', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        
        console.log(`🔍 Fetching streaming links from database - Page: ${page}, Limit: ${limit}`);
        
        const result = await getAllStreamingLinks(page, limit);
        
        res.json({
            success: true,
            data: result.streamingLinks,
            pagination: result.pagination,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching streaming links from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/streaming-links/anime?title=Naruto
app.get('/db/streaming-links/anime', async (req, res) => {
    try {
        const { title, limit = 50 } = req.query;
        
        if (!title) {
            return res.status(400).json({ 
                success: false,
                error: 'Title parameter is required',
                example: '/db/streaming-links/anime?title=Naruto'
            });
        }
        
        console.log(`🔍 Fetching streaming links for anime: "${title}"`);
        
        const result = await getStreamingLinksByAnime(title, limit);
        
        res.json({
            success: true,
            anime_title: title,
            data: result,
            total_episodes: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching anime streaming links:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/streaming-stats
app.get('/db/streaming-stats', async (req, res) => {
    try {
        console.log(`📊 Fetching streaming links statistics from database`);
        
        const stats = await getStreamingLinksStats();
        
        res.json({
            success: true,
            statistics: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching streaming links statistics:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🎯 SINGLE STREAMING LINKS ENDPOINTS

// http://localhost:5000/db/single-streaming-links
app.get('/db/single-streaming-links', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        
        console.log(`🔍 Fetching single streaming links from database - Page: ${page}, Limit: ${limit}`);
        
        const result = await getAllSingleStreamingLinks(page, limit);
        
        res.json({
            success: true,
            data: result.streamingLinks,
            pagination: result.pagination,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching single streaming links from database:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/single-streaming-links/anime?title=Naruto
app.get('/db/single-streaming-links/anime', async (req, res) => {
    try {
        const { title, limit = 50 } = req.query;
        
        if (!title) {
            return res.status(400).json({ 
                success: false,
                error: 'Title parameter is required',
                example: '/db/single-streaming-links/anime?title=Naruto'
            });
        }
        
        console.log(`🔍 Fetching single streaming links for anime: "${title}"`);
        
        const result = await getSingleStreamingLinksByAnime(title, limit);
        
        res.json({
            success: true,
            anime_title: title,
            data: result,
            total_episodes: result.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching single anime streaming links:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/single-streaming-stats
app.get('/db/single-streaming-stats', async (req, res) => {
    try {
        console.log(`📊 Fetching single streaming links statistics from database`);
        
        const stats = await getSingleStreamingLinksStats();
        
        res.json({
            success: true,
            statistics: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching single streaming links statistics:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Anime Scraper API v2.1 running at http://localhost:${PORT}`);
    console.log(`📡 Available endpoints:`);
    console.log(`   🎬 Scraping:`);
    console.log(`      📝 /anime-list?page=1`);
    console.log(`      📋 /anime-details?id=anime-name`);
    console.log(`      📺 /episode-stream?id=anime-name&ep=1`);
    console.log(`      🔥 /hianime-top10`);
    console.log(`      📅 /hianime-weekly-top10, /hianime-monthly-top10`);
    console.log(`   💾 Database:`);
    console.log(`      📚 /db/anime - Get all anime with pagination`);
    console.log(`      🔍 /db/search?q=naruto - Search anime`);
    console.log(`      🔥 /db/trending - Get trending anime`);
    console.log(`      📅 /db/weekly - Get weekly anime`);
    console.log(`      📅 /db/monthly - Get monthly anime`);
    console.log(`      📊 /db/stats - Get anime statistics`);
    console.log(`   🎥 Streaming Links:`);
    console.log(`      📋 /db/streaming-links - Get all streaming links`);
    console.log(`      🎬 /db/streaming-links/anime?title=Naruto - Get by anime`);
    console.log(`      📊 /db/streaming-stats - Get streaming statistics`);
    console.log(`   🎯 Single Streaming Links:`);
    console.log(`      📋 /db/single-streaming-links - Get all single streaming links`);
    console.log(`      🎬 /db/single-streaming-links/anime?title=Naruto - Get by anime`);
    console.log(`      📊 /db/single-streaming-stats - Get single streaming statistics`);
});