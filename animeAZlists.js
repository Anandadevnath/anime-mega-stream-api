import * as cheerio from 'cheerio';
import axios from 'axios';
import pLimit from 'p-limit';

export const animeAZlistAll = async () => {
    const totalPages = 214;
    const limit = pLimit(10);

    const fetchPage = async (page) => {
        try {
            const animelist = await axios.get(`https://anihq.to/az-list/page/${page}/`);
            const $ = cheerio.load(animelist.data);
            let links = [];
            $('.kira-grid > div').each((i, dat) => {
                const aTag = $(dat).find('.kira-anime > a');
                const link = aTag.attr('href');
                if (link) links.push(link);
            });
            console.log(`Fetched page ${page}`);
            return { page, links };
        } catch (error) {
            return { page, links: [], error: error.message };
        }
    };

    const tasks = [];
    for (let page = 1; page <= totalPages; page++) {
        tasks.push(limit(() => fetchPage(page)));
    }

    const allPages = await Promise.all(tasks);
    return allPages;
};