import * as cheerio from 'cheerio';
import axios from 'axios';

export const Anitaku = async () => {
    const resq = await axios.get("https://anitaku.io/");
    //    console.log(resq.data);
    
    const $ = cheerio.load(resq.data);
    $('.listupd > .excstf > article').each((i, dat) => {
        const aTag = $(dat).find('div > a');
        const link = aTag.attr('href');
        if (link) {
            console.log(link);
        }
    });
}
