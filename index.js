import express from 'express';
import { AniHQ } from './anime.js';
import { animeAZlistAll } from './animeAZlists.js';

const app = express();

app.get('/', (req, res) => {
    res.send('hello world');
});

// http://localhost:5000/anihq?page=200
app.get('/anihq', async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    try {
        const links = await AniHQ(page);
        res.json({ page, links });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch anime links.' });
    }
});

// http://localhost:5000/animeAZlist
app.get('/animeAZlist', async (req, res) => {
    try {
        const allPages = await animeAZlistAll();
        res.json(allPages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all anime links.' });
    }
});

app.listen(5000, () => {
    console.log('Server running at http://localhost:5000');
});