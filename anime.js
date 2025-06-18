import * as cheerio from 'cheerio';
import axios from 'axios';

export const AniHQ = async (page = 1) => {
    const animelist = await axios.get(`https://anihq.to/az-list/page/${page}/`);
    const $ = cheerio.load(animelist.data);
    let results = [];

    $('.kira-grid > div').each((i, dat) => {
        const aTag = $(dat).find('.kira-anime > a');
        const page_links = aTag.attr('href');
        const title = $(dat).find('span[data-en-title]').text().trim();
        const imgTag = $(dat).find('.kira-anime img');
        const img = imgTag.attr('src');
        if (page_links && img && title) {
            results.push({ page_links, img, title });
        }
    });


    return { page, results };
}