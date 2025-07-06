import Anime from '../models/Anime.js';

export const saveAnime = async (animeData) => {
    try {
        const anime = new Anime(animeData);
        await anime.save();
        console.log(`✅ Saved anime: ${anime.title}`);
        return anime;
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate key error - update existing
            const existingAnime = await Anime.findOneAndUpdate(
                { anime_redirect_link: animeData.anime_redirect_link },
                { ...animeData, updated_at: new Date() },
                { new: true, upsert: true }
            );
            console.log(`🔄 Updated existing anime: ${existingAnime.title}`);
            return existingAnime;
        } else {
            console.error(`❌ Error saving anime: ${error.message}`);
            throw error;
        }
    }
};

export const saveBulkAnime = async (animeList, category = 'general') => {
    try {
        const operations = animeList.map(anime => ({
            updateOne: {
                filter: { anime_redirect_link: anime.anime_redirect_link },
                update: { 
                    ...anime, 
                    category: category,
                    updated_at: new Date() 
                },
                upsert: true
            }
        }));

        const result = await Anime.bulkWrite(operations);
        
        console.log(`✅ Bulk save completed:`);
        console.log(`   • Inserted: ${result.upsertedCount}`);
        console.log(`   • Updated: ${result.modifiedCount}`);
        console.log(`   • Total: ${animeList.length}`);
        
        return result;
    } catch (error) {
        console.error(`❌ Error bulk saving anime: ${error.message}`);
        throw error;
    }
};
