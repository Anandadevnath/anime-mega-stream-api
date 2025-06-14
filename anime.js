import * as cheerio from 'cheerio';
import axios from 'axios';

export const Anitaku = async () => {
    const res_pages = await axios.get("https://animesugetv.se/genre/action?page=2");
    //    console.log(resq.data);
    
    const $ = cheerio.load(res_pages.data);
    $('.border-secondary > .main-card > div').each((i, dat) => {
        const aTag = $(dat).find('div > .inner > .item-top > a');
        const link = aTag.attr('href');
        if (link) {
            console.log(link);
        }
    });
}