import StreamingLink from '../models/StreamingLink.js';

export const saveStreamingLink = async (linkData) => {
    try {
        const streamingLink = new StreamingLink(linkData);
        await streamingLink.save();
        console.log(`✅ Saved streaming link: ${streamingLink.title} - Episode ${streamingLink.episode_number}`);
        return streamingLink;
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate key error - update existing
            const existingLink = await StreamingLink.findOneAndUpdate(
                { episode_url: linkData.episode_url },
                { ...linkData, updated_at: new Date() },
                { new: true, upsert: true }
            );
            console.log(`🔄 Updated existing streaming link: ${existingLink.title} - Episode ${existingLink.episode_number}`);
            return existingLink;
        } else {
            console.error(`❌ Error saving streaming link: ${error.message}`);
            throw error;
        }
    }
};

export const saveBulkStreamingLinks = async (linksData) => {
    try {
        const operations = linksData.map(link => ({
            updateOne: {
                filter: { episode_url: link.episode_url },
                update: { 
                    ...link, 
                    updated_at: new Date() 
                },
                upsert: true
            }
        }));

        const result = await StreamingLink.bulkWrite(operations);
        
        console.log(`✅ Bulk streaming links save completed:`);
        console.log(`   • Inserted: ${result.upsertedCount}`);
        console.log(`   • Updated: ${result.modifiedCount}`);
        console.log(`   • Total: ${linksData.length}`);
        
        return result;
    } catch (error) {
        console.error(`❌ Error bulk saving streaming links: ${error.message}`);
        throw error;
    }
};

export const getStreamingLinksByAnime = async (animeTitle, limit = 50) => {
    try {
        const streamingLinks = await StreamingLink.find({ 
            title: { $regex: animeTitle, $options: 'i' } 
        })
        .sort({ episode_number: 1 })
        .limit(limit);
        
        return streamingLinks;
    } catch (error) {
        console.error(`❌ Error getting streaming links by anime: ${error.message}`);
        throw error;
    }
};

export const getAllStreamingLinks = async (page = 1, limit = 50) => {
    try {
        const skip = (page - 1) * limit;
        const streamingLinks = await StreamingLink.find()
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await StreamingLink.countDocuments();
        
        return {
            streamingLinks,
            pagination: {
                current_page: page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                items_per_page: limit
            }
        };
    } catch (error) {
        console.error(`❌ Error getting all streaming links: ${error.message}`);
        throw error;
    }
};

export const getStreamingLinksStats = async () => {
    try {
        const stats = await StreamingLink.aggregate([
            {
                $group: {
                    _id: null,
                    total_links: { $sum: 1 },
                    unique_anime: { $addToSet: '$title' },
                    unique_sources: { $addToSet: '$source' }
                }
            },
            {
                $project: {
                    total_links: 1,
                    unique_anime_count: { $size: '$unique_anime' },
                    unique_sources_count: { $size: '$unique_sources' }
                }
            }
        ]);

        const animeStats = await StreamingLink.aggregate([
            {
                $group: {
                    _id: '$title',
                    episode_count: { $sum: 1 }
                }
            },
            {
                $sort: { episode_count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        const sourceStats = await StreamingLink.aggregate([
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            ...stats[0],
            top_anime_by_episodes: animeStats,
            source_breakdown: sourceStats
        };
    } catch (error) {
        console.error(`❌ Error getting streaming links stats: ${error.message}`);
        throw error;
    }
};

export const searchStreamingLinks = async (query, limit = 20) => {
    try {
        const streamingLinks = await StreamingLink.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { episode_number: { $regex: query, $options: 'i' } }
            ]
        })
        .sort({ created_at: -1 })
        .limit(limit);
        
        return streamingLinks;
    } catch (error) {
        console.error(`❌ Error searching streaming links: ${error.message}`);
        throw error;
    }
};

export const getStreamingLinksBySource = async (source, limit = 50) => {
    try {
        const streamingLinks = await StreamingLink.find({ source })
            .sort({ created_at: -1 })
            .limit(limit);
        
        return streamingLinks;
    } catch (error) {
        console.error(`❌ Error getting streaming links by source: ${error.message}`);
        throw error;
    }
};

export const deleteStreamingLinksByAnime = async (animeTitle) => {
    try {
        const result = await StreamingLink.deleteMany({ 
            title: { $regex: animeTitle, $options: 'i' } 
        });
        
        console.log(`🗑️ Deleted ${result.deletedCount} streaming links for anime: ${animeTitle}`);
        return result;
    } catch (error) {
        console.error(`❌ Error deleting streaming links: ${error.message}`);
        throw error;
    }
};

export const clearAllStreamingLinks = async () => {
    try {
        const result = await StreamingLink.deleteMany({});
        console.log(`🗑️ Cleared all streaming links. Deleted count: ${result.deletedCount}`);
        return result;
    } catch (error) {
        console.error(`❌ Error clearing all streaming links: ${error.message}`);
        throw error;
    }
};