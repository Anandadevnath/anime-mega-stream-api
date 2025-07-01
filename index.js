import express from 'express';
import { test } from './test.js';
import { Aniscrape } from './anime.js';
import { AnimeAZ } from './animeAZlists.js';

const app = express();

// http://localhost:5000/anime-list?page=2
app.get('/anime-list', async (req, res) => {
    try {
        const pageNum = parseInt(req.query.page) || 1;

        const animeList = await AnimeAZ(pageNum);

        const formattedList = animeList.map(anime => ({
            title: anime.title,
            redirectlink: anime.redirectlink,
            details: anime.details,
            image: anime.image,
            total_episodes: anime.total_episodes,
            lang: anime.type
        }));

        res.json(formattedList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(5000, () => {
    console.log('Server running at http://localhost:5000');
    console.log('Available endpoints:');
    console.log('  GET /anime-list?page=1 - Get detailed anime list');
});