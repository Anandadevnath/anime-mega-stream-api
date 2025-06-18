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
        const title_show = $(dat).find('.show').text().trim();
        const Television = $(dat).find('.uppercase').text().trim();
        const minText = $(dat).find('.text-xs.text-text-color.w-full.line-clamp-1').text();
        const minMatch = minText.match(/(\d+\s*(?:m|mins|minutes))/i);
        const min = minMatch ? minMatch[0].replace(/\s+/g, '') : null;
        const sub = $(dat).find('.mie-px').text().trim();
        const episode = $(dat).find('.plb-1').text().trim();
        const imgTag = $(dat).find('.kira-anime img');
        const img = imgTag.attr('src');
        if (page_links && img && title && title_show && Television && min && episode && sub) {
            results.push({ page_links, img, title, title_show, Television, min, episode, sub });
        }
    });


    return { page, results };
}