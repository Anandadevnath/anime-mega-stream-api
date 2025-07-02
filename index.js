import express from 'express';
import { AnimeAZ } from './animeAZlists.js';
import { Aniscrape } from './anime.js';
import { test } from './test.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// http://localhost:5000/anime-list?page=1
// app.get('/anime-list', async (req, res) => {
//     try {
//         const pageNum = parseInt(req.query.page) || 1;
//         console.log(`🚀 Fetching anime list - Page: ${pageNum}`);

//         const animeList = await AnimeAZ(pageNum);

//         const formattedList = animeList.map(anime => ({
//             title: anime.title,
//             redirectlink: anime.redirectlink,
//             details: {
//                 type: anime.details.type,
//                 genre: anime.details.genre,
//                 episode_links: anime.details.episode_links.map(episode => ({
//                     episode_number: episode.episode_number,
//                     episode_url: episode.episode_url,
//                     iframe_src: episode.iframe_src || null,
//                     range_id: episode.range_id,
//                     range_index: episode.range_index
//                 }))
//             },
//             image: anime.image,
//             total_episodes: anime.total_episodes,
//             lang: anime.type
//         }));

//         res.json({
//             success: true,
//             page: pageNum,
//             total_anime: formattedList.length,
//             total_episodes: formattedList.reduce((total, anime) => total + anime.details.episode_links.length, 0),
//             data: formattedList
//         });

//     } catch (error) {
//         console.error('❌ Error:', error.message);
//         res.status(500).json({ 
//             success: false,
//             error: error.message 
//         });
//     }
// });

test();

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`🚀 Anime Scraper API running at http://localhost:${PORT}`);
});