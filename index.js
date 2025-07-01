import express from 'express';
import { test } from './test.js';
import { Aniscrape } from './anime.js';
import { AnimeAZ } from './animeAZlists.js';

const app = express();

// http://localhost:5000/anime-list
app.get('/anime-list', async (req, res) => {
    try {
        const animeList = await AnimeAZ();

        const formattedList = animeList.map(anime => ({
            title: anime.title,
            redirectlink: anime.link
        }));
        
        res.json(formattedList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(5000, () => {
    console.log('Server running at http://localhost:5000');
});