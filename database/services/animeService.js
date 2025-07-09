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

// export const getAnimeByCategory = async (category, limit = 10) => {
//     try {
//         const anime = await Anime.find({ category })
//             .sort({ scraped_at: -1 })
//             .limit(limit);
//         return anime;
//     } catch (error) {
//         console.error(`❌ Error getting anime by category: ${error.message}`);
//         throw error;
//     }
// };

export const getAllAnime = async (page = 1, limit = 20) => {
    try {
        const skip = (page - 1) * limit;
        const anime = await Anime.find()
            .sort({ scraped_at: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await Anime.countDocuments();
        
        return {
            anime,
            pagination: {
                current_page: page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                items_per_page: limit
            }
        };
    } catch (error) {
        console.error(`❌ Error getting all anime: ${error.message}`);
        throw error;
    }
};

// export const searchAnime = async (query, limit = 10) => {
//     try {
//         const anime = await Anime.find({
//             $or: [
//                 { title: { $regex: query, $options: 'i' } },
//                 { genres: { $regex: query, $options: 'i' } },
//                 { description: { $regex: query, $options: 'i' } }
//             ]
//         })
//         .sort({ scraped_at: -1 })
//         .limit(limit);
        
//         return anime;
//     } catch (error) {
//         console.error(`❌ Error searching anime: ${error.message}`);
//         throw error;
//     }
// };

export const getAnimeStats = async () => {
    try {
        const stats = await Anime.aggregate([
            {
                $group: {
                    _id: null,
                    total_anime: { $sum: 1 },
                    with_images: {
                        $sum: {
                            $cond: [{ $ne: ['$image', null] }, 1, 0]
                        }
                    },
                    with_descriptions: {
                        $sum: {
                            $cond: [{ $ne: ['$description', null] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const categoryStats = await Anime.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        const sourceStats = await Anime.aggregate([
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            ...stats[0],
            category_breakdown: categoryStats,
            source_breakdown: sourceStats
        };
    } catch (error) {
        console.error(`❌ Error getting anime stats: ${error.message}`);
        throw error;
    }
};

// Get a paginated list of anime for streaming link scraping
export const getAnimeList = async (limit = 10, skip = 0) => {
    try {
        const anime = await Anime.find()
            .sort({ scraped_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        return anime;
    } catch (error) {
        console.error(`❌ Error getting anime list: ${error.message}`);
        throw error;
    }
};
