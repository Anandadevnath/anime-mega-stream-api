import express from 'express';
import dotenv from 'dotenv';
import connectDB from './database/config.js';
import { scrapeFilmList } from './scrapeFilmList.js';
import { scrapeAnimeDetails } from './scrapeAnimeDetails.js';
import { scrapeSingleEpisode } from './scrapeSingleEpisode.js';
import { scrapeHiAnimeTop10 } from './Top-Animes/scrapeHiAnimeTop10.js';
import { scrapeHiAnimeWeeklyTop10 } from './Top-Animes/scrapeHiAnimeWeeklyTop10.js';
import { scrapeHiAnimeMonthlyTop10 } from './Top-Animes/scrapeHiAnimeMonthlyTop10.js';
import { scrapeFilmList100, scrapeAll501Pages, scrapeInBatches } from './scrapeFilmList100.js';
import { scrapeAnimeDetailsBatch } from './scrapeAnimeDetails100.js';
import {
    saveBulkAnime,
} from './database/services/animeService.js';


import dbRoutes from './indexdb.js';
import removeAnimeRouter from './removeanime.js';

dotenv.config();
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

// Use database routes

app.use(removeAnimeRouter);
app.use('/db', dbRoutes);

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


// http://localhost:5000/scrape-pages?start=281&end=300
// http://localhost:5000/streaming-links?start=0&end=9

// http://localhost:5000/scrape-all-pages
app.get('/scrape-all-pages', async (req, res) => {
    try {
        console.log('🚀 Starting to scrape all 501 pages...');
        
        // Set longer timeout for this endpoint
        req.setTimeout(0); // No timeout
        res.setTimeout(0); // No timeout
        
        const startTime = Date.now();
        
        // Send immediate response to acknowledge request
        res.status(202).json({
            success: true,
            message: "🚀 Started scraping all 501 pages in the background",
            status: "processing",
            estimated_time: "30-60 minutes",
            progress_check: "Check server logs for real-time progress",
            timestamp: new Date().toISOString()
        });
        
        // Start scraping in background
        scrapeAll501Pages()
            .then(result => {
                const endTime = Date.now();
                const totalTime = (endTime - startTime) / 1000 / 60; // in minutes
                
                console.log(`\n🎉 BULK SCRAPING COMPLETED!`);
                console.log(`⏱️ Total time: ${totalTime.toFixed(2)} minutes`);
                console.log(`📊 Final Result:`, result);
            })
            .catch(error => {
                console.error('❌ Bulk scraping failed:', error.message);
            });
            
    } catch (error) {
        console.error('❌ Error starting bulk scrape:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/scrape-in-batches?batch_size=50
app.get('/scrape-in-batches', async (req, res) => {
    try {
        const batchSize = parseInt(req.query.batch_size) || 50;
        
        console.log(`🚀 Starting to scrape 501 pages in batches of ${batchSize}...`);
        
        // Validate batch size
        if (batchSize < 1 || batchSize > 100) {
            return res.status(400).json({
                success: false,
                error: 'Batch size must be between 1 and 100',
                example: '/scrape-in-batches?batch_size=50'
            });
        }
        
        req.setTimeout(0); // No timeout
        res.setTimeout(0); // No timeout
        
        const startTime = Date.now();
        
        // Send immediate response
        res.status(202).json({
            success: true,
            message: `🚀 Started scraping 501 pages in batches of ${batchSize}`,
            status: "processing",
            batch_size: batchSize,
            total_batches: Math.ceil(501 / batchSize),
            estimated_time: "20-40 minutes",
            progress_check: "Check server logs for real-time progress",
            timestamp: new Date().toISOString()
        });
        
        // Start batch scraping in background
        scrapeInBatches(batchSize)
            .then(result => {
                const endTime = Date.now();
                const totalTime = (endTime - startTime) / 1000 / 60; // in minutes
                
                console.log(`\n🎉 BATCH SCRAPING COMPLETED!`);
                console.log(`⏱️ Total time: ${totalTime.toFixed(2)} minutes`);
                console.log(`📊 Final Result:`, result);
            })
            .catch(error => {
                console.error('❌ Batch scraping failed:', error.message);
            });
            
    } catch (error) {
        console.error('❌ Error starting batch scrape:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/scrape-pages?start=1&end=100
app.get('/scrape-pages', async (req, res) => {
    try {
        const startPage = parseInt(req.query.start) || 1;
        const endPage = parseInt(req.query.end) || 10;
        
        // Validate page range
        if (startPage < 1 || endPage < 1) {
            return res.status(400).json({
                success: false,
                error: 'Start and end pages must be positive integers',
                example: '/scrape-pages?start=1&end=100'
            });
        }
        
        if (startPage > endPage) {
            return res.status(400).json({
                success: false,
                error: 'Start page must be less than or equal to end page',
                example: '/scrape-pages?start=1&end=100'
            });
        }
        
        if (endPage > 501) {
            return res.status(400).json({
                success: false,
                error: 'End page cannot exceed 501',
                example: '/scrape-pages?start=1&end=501'
            });
        }
        
        const totalPages = endPage - startPage + 1;
        
        if (totalPages > 100) {
            return res.status(400).json({
                success: false,
                error: 'Cannot scrape more than 100 pages at once. Use batch scraping for larger ranges.',
                suggestion: 'Use /scrape-in-batches?batch_size=50 for larger ranges'
            });
        }
        
        console.log(`🚀 Starting to scrape pages ${startPage} to ${endPage} (${totalPages} pages)...`);
        
        const startTime = Date.now();
        const result = await scrapeFilmList100(startPage, endPage);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`✅ Custom scraping completed in ${duration.toFixed(2)} seconds`);
        
        res.json({
            success: true,
            message: `Successfully scraped pages ${startPage} to ${endPage}`,
            page_range: {
                start: startPage,
                end: endPage,
                total_pages: totalPages
            },
            results: {
                pages_processed: result.pages_processed,
                pages_failed: result.pages_failed,
                total_anime_found: result.total_anime_found,
                total_anime_saved: result.total_anime_saved,
                success_rate: result.success_rate + '%'
            },
            extraction_time_seconds: duration,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in custom page scraping:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/streaming-links?start=0&end=9
app.get('/streaming-links', async (req, res) => {
    const start = parseInt(req.query.start) || 0;
    const end = parseInt(req.query.end) || 9;
    const limit = end - start + 1;
    try {
        await scrapeAnimeDetailsBatch(start, limit);
        res.json({ success: true, message: `Scraped anime ${start + 1} to ${end + 1}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Anime Scraper API v2.1 running at http://localhost:${PORT}`);
});