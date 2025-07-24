import express from 'express';
import {
    getAllAnime,
    getAnimeStats,
} from './database/services/animeService.js';
import {
    getAllStreamingLinks,
    getStreamingLinksStats,
    getStreamingLinksByTitle
} from './database/services/streamingLinkService.js';
import {
    getAllSingleStreamingLinks,
    getSingleStreamingLinksStats,
    getSingleStreamingLinksByTitle
} from './database/services/singleStreamingLinkService.js';

const router = express.Router();

// http://localhost:5000/db/anime-list?page=1
router.get('/anime-list', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        console.log(`🔍 Fetching anime from database - Page: ${page}, Limit: ${limit}`);
        const result = await getAllAnime(page, limit);
        res.json({
            success: true,
            source: "Database",
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

// http://localhost:5000/db/stats
router.get('/stats', async (req, res) => {
    try {
        console.log(`📊 Fetching database statistics`);
        const [animeStats, streamingStats, singleStreamingStats] = await Promise.all([
            getAnimeStats(),
            getStreamingLinksStats(),
            getSingleStreamingLinksStats()
        ]);
        res.json({
            success: true,
            source: "Database",
            statistics: {
                anime: animeStats,
                streaming_links: streamingStats,
                single_streaming_links: singleStreamingStats
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error fetching database statistics:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// http://localhost:5000/db/streaming-links
router.get('/streaming-links', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        console.log(`🔍 Fetching streaming links from database - Page: ${page}, Limit: ${limit}`);
        const result = await getAllStreamingLinks(page, limit);
        res.json({
            success: true,
            source: "Database",
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

// http://localhost:5000/db/single-streaming-links
router.get('/single-streaming-links', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        console.log(`🔍 Fetching single streaming links from database - Page: ${page}, Limit: ${limit}`);
        const result = await getAllSingleStreamingLinks(page, limit);
        res.json({
            success: true,
            source: "Database",
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

// http://localhost:5000/db/anime-details?id=your-forma
router.get('/anime-details', async (req, res) => {
    try {
        const title = req.query.id;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Missing anime title (id) in query.' });
        }
        // Try to fetch from StreamingLink collection first
        let links = await getStreamingLinksByTitle(title);
        // If not found, fallback to SingleStreamingLink collection
        if (!links.length) {
            links = await getSingleStreamingLinksByTitle(title);
        }
        if (!links.length) {
            return res.status(404).json({ success: false, message: 'No streaming links found for this anime.' });
        }
        res.json({ success: true, count: links.length, streaming_links: links });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// http://localhost:5000/db/anime-list?page=1

// http://localhost:5000/db/stats

// http://localhost:5000/db/streaming-links
// http://localhost:5000/db/single-streaming-links
// http://localhost:5000/db/anime-details?id=your-forma

export default router;