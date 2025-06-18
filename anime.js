import * as cheerio from 'cheerio';
import axios from 'axios';

const extractRoutingPageInfo = async (url) => {
    try {
        const res = await axios.get(url);
        const $ = cheerio.load(res.data);

        const description = $('.line-clamp-3').text().trim();
        const watchLink = $('.flex.items-center.justify-center.sm\\:justify-start.gap-2.mbe-5.relative.flex-wrap a').attr('href') || null;

        const metaInfo = [];
        $('.anime-metadata li').each((i, el) => {
            const text = $(el).text().trim();
            metaInfo.push({ text });
        });

        return { description, metaInfo, watchLink };
    } catch (error) {
        return { description: '', metaInfo: [], watchLink: null };
    }
};

export const AniHQ = async (page = 1) => {
    const animelist = await axios.get(`https://anihq.to/az-list/page/${page}/`);
    const $ = cheerio.load(animelist.data);

    const tasks = $('.kira-grid > div').map(async (i, dat) => {
        const aTag = $(dat).find('.kira-anime > a');
        const page_links = aTag.attr('href');
        const title = $(dat).find('span[data-en-title]').text().trim();
        const title_show = $(dat).find('.show').text().trim();
        const Television = $(dat).find('.uppercase').text().trim();
        const imgTag = $(dat).find('.kira-anime img');
        const img = imgTag.attr('data-lazy-src');

        let routing_info = { mainTitle: '', description: '' };
        if (page_links) {
            routing_info = await extractRoutingPageInfo(page_links);
        }

        if (page_links && img && title && title_show && Television) {
            return {
                page_links,
                img,
                title,
                title_show,
                Television,
                routing_info
            };
        }
        return null;
    }).get();

    const results = (await Promise.all(tasks)).filter(Boolean);

    return {
        page,
        links: {
            page,
            results
        }
    };
};